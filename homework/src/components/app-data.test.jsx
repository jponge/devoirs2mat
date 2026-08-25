import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AppDataProvider, useAppData } from "@/components/app-data";
import { todayDate } from "@/lib/dates";

// The database layer is faked at module level, the way `src/db/*.test.js`
// already does it. `restoreMocks` and `clearMocks` in `vite.config.js` are what
// keep these fakes from leaking their call history between tests.
const { listCourses, listHomeworkBetween } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
}));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween }));

const COURSE = {
  id: 1,
  name: "Zoologie",
  archived_at: null,
  created_at: "2026-08-21T09:14:03Z",
};

beforeEach(() => {
  listCourses.mockResolvedValue([COURSE]);
  listHomeworkBetween.mockResolvedValue([]);
});

// A probe rather than `renderHook`: it keeps the latest context value reachable
// and lets a test drive the same functions a component would call.
let latest = null;

function Probe() {
  latest = useAppData();
  return <output data-testid="range">{`${latest.view}:${latest.selectedDate}`}</output>;
}

async function mount(props = {}) {
  latest = null;
  render(
    <AppDataProvider today="2026-08-24" {...props}>
      <Probe />
    </AppDataProvider>,
  );
  // The first load is asynchronous; without waiting, every assertion would run
  // against the pre-load state.
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
  return latest;
}

const lastRange = () => listHomeworkBetween.mock.calls.at(-1);

describe("the visible range", () => {
  it("is a single day in daily view", async () => {
    await mount();

    // Inclusive on both ends, so one day is `from === to`.
    expect(lastRange()).toEqual(["2026-08-24", "2026-08-24"]);
  });

  it("is Monday to Sunday in weekly view", async () => {
    await mount({ initialView: "weekly" });

    expect(lastRange()).toEqual(["2026-08-24", "2026-08-30"]);
  });

  // 2026-08-26 is a Wednesday: the week must start on the Monday before it, not
  // on the selected day.
  it("starts on the Monday of the week containing the selected date", async () => {
    await mount({ today: "2026-08-26", initialView: "weekly" });

    expect(lastRange()).toEqual(["2026-08-24", "2026-08-30"]);
  });

  // A Sunday closes the week that began the Monday before it.
  it("puts a Sunday in the week that is ending, not the one starting", async () => {
    await mount({ today: "2026-08-30", initialView: "weekly" });

    expect(lastRange()).toEqual(["2026-08-24", "2026-08-30"]);
  });
});

describe("stepping", () => {
  it("moves by one day in daily view", async () => {
    await mount();

    await act(async () => latest.goNext());
    expect(latest.selectedDate).toBe("2026-08-25");

    await act(async () => latest.goPrevious());
    await act(async () => latest.goPrevious());
    expect(latest.selectedDate).toBe("2026-08-23");
  });

  it("moves by exactly seven days in weekly view", async () => {
    await mount({ initialView: "weekly" });

    await act(async () => latest.goNext());
    expect(latest.selectedDate).toBe("2026-08-31");

    await act(async () => latest.goPrevious());
    await act(async () => latest.goPrevious());
    expect(latest.selectedDate).toBe("2026-08-17");
  });

  it("crosses a month boundary without skipping a day", async () => {
    await mount({ today: "2026-08-31" });

    await act(async () => latest.goNext());
    expect(latest.selectedDate).toBe("2026-09-01");
  });

  it("re-queries the new range", async () => {
    await mount();

    await act(async () => latest.goNext());
    await waitFor(() =>
      expect(lastRange()).toEqual(["2026-08-25", "2026-08-25"]),
    );
  });
});

describe("switching view", () => {
  // Required explicitly by `specs/functional-specs.md`.
  it("keeps the selected date", async () => {
    await mount({ today: "2026-08-26" });

    await act(async () => latest.setView("weekly"));

    expect(latest.selectedDate).toBe("2026-08-26");
    expect(latest.view).toBe("weekly");
  });

  it("re-queries with the range the new view implies", async () => {
    await mount({ today: "2026-08-26" });
    expect(lastRange()).toEqual(["2026-08-26", "2026-08-26"]);

    await act(async () => latest.setView("weekly"));

    await waitFor(() =>
      expect(lastRange()).toEqual(["2026-08-24", "2026-08-30"]),
    );
  });

  // Radix lets a single-type toggle group deselect its active item, which
  // arrives here as an empty string. Storing it would render neither view.
  it("ignores an empty view rather than storing it", async () => {
    await mount();

    await act(async () => latest.setView(""));

    expect(latest.view).toBe("daily");
  });

  it("ignores a view it does not know", async () => {
    await mount();

    await act(async () => latest.setView("monthly"));

    expect(latest.view).toBe("daily");
  });
});

describe("selecting a date", () => {
  it("takes the date the picker gives back", async () => {
    await mount();

    await act(async () => latest.selectDate("2026-12-25"));

    expect(latest.selectedDate).toBe("2026-12-25");
  });

  it("refuses a malformed date rather than querying with it", async () => {
    await mount();
    const before = listHomeworkBetween.mock.calls.length;

    await act(async () => {
      expect(() => latest.selectDate("nope")).toThrow();
    });

    expect(latest.selectedDate).toBe("2026-08-24");
    expect(listHomeworkBetween.mock.calls.length).toBe(before);
  });
});

describe("courses", () => {
  it("keeps archived ones, because an entry still shows their name", async () => {
    const archived = {
      id: 2,
      name: "Latin",
      archived_at: "2026-08-22T09:14:03Z",
      created_at: "2026-08-20T09:14:03Z",
    };
    listCourses.mockResolvedValue([COURSE, archived]);

    await mount();

    await waitFor(() => expect(latest.courses).toHaveLength(2));
    expect(latest.courses.map((c) => c.id)).toContain(2);
  });
});

describe("out-of-order responses", () => {
  // Not concurrency anxiety about other processes — this application has
  // exactly one. It is the component racing itself: clicking next twice fires
  // two reads, and the first one resolving last would paint stale data.
  it("never let an older read overwrite a newer one", async () => {
    const first = { id: 10, due_date: "2026-08-24", course_id: 1, done: 0, text: "old", created_at: "2026-08-21T09:00:00Z" };
    const second = { id: 11, due_date: "2026-08-25", course_id: 1, done: 0, text: "new", created_at: "2026-08-21T09:00:00Z" };

    let releaseFirst;
    listHomeworkBetween.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = () => resolve([first]); }),
    );

    await mount();
    // The second read resolves immediately and lands first.
    listHomeworkBetween.mockResolvedValue([second]);
    await act(async () => latest.goNext());
    await waitFor(() => expect(latest.homework).toEqual([second]));

    // Now the stale first read finally answers.
    await act(async () => {
      releaseFirst();
      await Promise.resolve();
    });

    expect(latest.homework).toEqual([second]);
  });
});

describe("a failing read", () => {
  it("surfaces the error", async () => {
    const failure = new Error("no such table: homework");
    listHomeworkBetween.mockRejectedValue(failure);

    await mount();

    await waitFor(() => expect(latest.error).toBe(failure));
  });

  it("leaves the data that was already on screen alone", async () => {
    const item = { id: 10, due_date: "2026-08-24", course_id: 1, done: 0, text: "kept", created_at: "2026-08-21T09:00:00Z" };
    listHomeworkBetween.mockResolvedValue([item]);

    await mount();
    await waitFor(() => expect(latest.homework).toEqual([item]));

    listHomeworkBetween.mockRejectedValue(new Error("gone"));
    await act(async () => latest.goNext());

    await waitFor(() => expect(latest.error).not.toBeNull());
    // Blanking the view on a failed refresh would lose what the student was
    // looking at, on top of telling them it broke.
    expect(latest.homework).toEqual([item]);
  });

  it("clears the error once a later read succeeds", async () => {
    listHomeworkBetween.mockRejectedValue(new Error("gone"));
    await mount();
    await waitFor(() => expect(latest.error).not.toBeNull());

    listHomeworkBetween.mockResolvedValue([]);
    await act(async () => latest.reload());

    await waitFor(() => expect(latest.error).toBeNull());
  });
});

describe("useAppData outside a provider", () => {
  it("fails loudly rather than handing back undefined", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow(/AppDataProvider/);

    logged.mockRestore();
  });
});

// Every other test injects `today` so the assertions can be literal dates. The
// default is what the application actually opens on, so it needs its own test.
describe("the initial date", () => {
  it("starts on the local system date", async () => {
    latest = null;
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());

    expect(latest.selectedDate).toBe(todayDate());
    expect(lastRange()).toEqual([todayDate(), todayDate()]);
  });
});
