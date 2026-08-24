import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSetting, setSetting } from "@/db/settings";

const { select, execute, load } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

beforeEach(() => {
  load.mockResolvedValue({ select, execute });
  select.mockResolvedValue([]);
  execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
});

const lastSql = (spy) => spy.mock.calls.at(-1)[0];
const lastValues = (spy) => spy.mock.calls.at(-1)[1];

describe("getSetting", () => {
  it("returns the stored value", async () => {
    select.mockResolvedValue([{ value: "fr" }]);

    expect(await getSetting("language")).toBe("fr");
    expect(lastValues(select)).toEqual(["language"]);
  });

  // An absent key is normal, not an error: the language preference is absent
  // until the user picks one, and the reader falls back to locale detection.
  it("returns null when the key was never written", async () => {
    select.mockResolvedValue([]);

    expect(await getSetting("language")).toBe(null);
  });
});

describe("setSetting", () => {
  it("writes a key that does not exist yet", async () => {
    await setSetting("language", "fr");

    expect(lastValues(execute)).toEqual(["language", "fr"]);
    expect(lastSql(execute)).toMatch(/insert\s+into\s+settings/i);
  });

  // `key` is the primary key, so a second write of the same preference has to
  // upsert rather than fail on the constraint.
  it("overwrites a key that already exists", async () => {
    await setSetting("language", "en");

    expect(lastSql(execute)).toMatch(/on\s+conflict\s*\(\s*key\s*\)\s*do\s+update/i);
    expect(lastValues(execute)).toEqual(["language", "en"]);
  });
});
