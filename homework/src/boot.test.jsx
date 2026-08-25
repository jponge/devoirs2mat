import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";
import { boot, reportLateStartupFailure } from "@/boot";
// The catalogue, not a copy of it: the wording of a user-facing string is not
// what these tests are about, and pinning a fragment of it here made an
// editorial pass fail three unrelated tests.
import en from "@/i18n/en.json";

// The data layer is faked: the Tauri SQL plugin only exists inside the Tauri
// runtime, and `boot` now renders the real application, which reads on mount.
const { listCourses, listHomeworkBetween } = vi.hoisted(() => ({
  listCourses: vi.fn(async () => []),
  listHomeworkBetween: vi.fn(async () => []),
}));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween }));

// `boot` renders into a container of its own rather than through Testing
// Library's render, so it cleans up after itself here.
const containers = [];

function freshContainer() {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  return container;
}

afterEach(() => {
  while (containers.length > 0) {
    containers.pop().remove();
  }
});

describe("boot", () => {
  it("renders the application", async () => {
    // `createRoot().render()` is asynchronous, so the assertion has to wait for
    // React to flush rather than reading an empty container.
    await act(async () => {
      boot(freshContainer());
    });

    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
  });

  // The link that actually carries a startup database failure to the user. It
  // is a prop threaded from here into `App`, and the shared context deliberately
  // does not carry it: this test is what stops a refactor from quietly dropping
  // the only report the student would ever see.
  it("hands a startup error to the application", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("the database did not open");

    await act(async () => {
      boot(freshContainer(), failure);
    });

    // Reported as a toast, which is what `specs/functional-specs.md` requires
    // for a migration error at startup.
    await waitFor(() => {
      expect(screen.getByText(en.errors.startupFailed)).not.toBeNull();
    });
    expect(logged.mock.calls.flat()).toContain(failure);
  });

  it("reports no error when startup succeeded", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      boot(freshContainer());
    });

    expect(logged).not.toHaveBeenCalled();
    expect(screen.queryByText(en.errors.startupFailed)).toBeNull();
  });

  // `boot` renders under `StrictMode`, which double-mounts effects in
  // development. Without the dedupe the student would get two identical toasts
  // for one failure.
  it("reports a startup failure once, not once per StrictMode mount", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("the database did not open");

    await act(async () => {
      boot(freshContainer(), failure);
    });

    await waitFor(() => {
      expect(screen.getAllByText(en.errors.startupFailed)).toHaveLength(1);
    });
  });
});

// The other half of the startup failure path. When the deadline wins,
// `resolveStartup` settles with NO error and the application renders in the
// detected language; a real failure arriving after that reaches nobody unless
// `onLate` reports it. `main.jsx` cannot be imported from a test, which is why
// this lives in `boot.jsx`.
describe("a startup failure that arrives late", () => {
  it("still reaches the user, because a failure is never silent", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      boot(freshContainer());
    });
    // The application rendered clean: the deadline settled without an error.
    expect(screen.queryByText(en.errors.startupFailed)).toBeNull();

    await act(async () => {
      reportLateStartupFailure(new Error("the migration failed, eventually"));
    });

    await waitFor(() => {
      expect(screen.getByText(en.errors.startupFailed)).not.toBeNull();
    });
    expect(logged).toHaveBeenCalled();
  });

  it("says nothing when the late answer carried no error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      boot(freshContainer());
    });

    await act(async () => {
      reportLateStartupFailure(null);
      reportLateStartupFailure(undefined);
    });

    expect(screen.queryByText(en.errors.startupFailed)).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });
});
