import { describe, it, expect, vi, beforeEach } from "vitest";

// The convention for every `src/db/` test, here and in the milestones that
// follow: the SQL plugin is faked with `vi.mock`, never run. It only exists
// inside the Tauri runtime, so there is no database behind `invoke` in vitest.
//
// `vi.hoisted` is what makes the spies usable from the factory: `vi.mock` is
// hoisted above the imports, so a plain `const` declared below would still be in
// its temporal dead zone when the factory runs.
const { load } = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

// `client.js` caches its connection promise for the life of the module, which is
// the behaviour under test — so each test needs a fresh module instance.
beforeEach(() => {
  vi.resetModules();
  load.mockReset();
  load.mockResolvedValue({ select: vi.fn(), execute: vi.fn() });
});

describe("getDatabase", () => {
  it("opens the database in the application data directory", async () => {
    const { getDatabase } = await import("@/db/client");

    await getDatabase();

    expect(load).toHaveBeenCalledWith("sqlite:homework.db");
  });

  it("pins the database url the whole application agrees on", async () => {
    const { DATABASE_URL } = await import("@/db/client");

    expect(DATABASE_URL).toBe("sqlite:homework.db");
  });

  it("opens the database once and reuses it", async () => {
    const { getDatabase } = await import("@/db/client");

    const first = await getDatabase();
    const second = await getDatabase();
    const third = await getDatabase();

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  // The reason the *promise* is cached rather than the resolved database:
  // several modules calling this during startup must not race into several
  // `load` calls while the first one is still in flight.
  it("shares one load between callers that arrive before it resolves", async () => {
    let resolveLoad;
    load.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const { getDatabase } = await import("@/db/client");

    const both = Promise.all([getDatabase(), getDatabase()]);
    resolveLoad({ select: vi.fn(), execute: vi.fn() });
    const [first, second] = await both;

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});
