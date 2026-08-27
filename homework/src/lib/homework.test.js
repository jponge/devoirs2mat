import { describe, it, expect } from "vitest";
import { validateHomeworkCourseId, isLastUndoneForDay } from "@/lib/homework";

const COURSES = [
  { id: 1, name: "Maths", archived_at: null },
  { id: 12, name: "Zoologie", archived_at: null },
];

describe("validateHomeworkCourseId", () => {
  it("rejects a missing course", () => {
    expect(validateHomeworkCourseId(null, COURSES)).toBe("required");
    expect(validateHomeworkCourseId(undefined, COURSES)).toBe("required");
  });

  it("accepts a course id that is one of the options, including a multi-digit one", () => {
    expect(validateHomeworkCourseId(1, COURSES)).toBeNull();
    expect(validateHomeworkCourseId(12, COURSES)).toBeNull();
  });

  // A course picked in an open draft can be archived out from under it by a
  // concurrent action; once it drops out of the option list it must not save.
  it("rejects a course id that is no longer one of the options", () => {
    expect(validateHomeworkCourseId(99, COURSES)).toBe("required");
  });

  it("rejects everything when there are no options left", () => {
    expect(validateHomeworkCourseId(1, [])).toBe("required");
  });
});

describe("isLastUndoneForDay", () => {
  const dayItems = [
    { id: 1, done: 0 },
    { id: 2, done: 1 },
    { id: 3, done: 0 },
  ];

  it("is true when checking the last undone item of the day", () => {
    // id 1 is the only other undone item; checking id 3 with the two others
    // already done (id 2) or being toggled true (id 1 is still 0 here,
    // representing a day where only the toggled item itself is left) reads
    // true once every other item is already done.
    const items = [
      { id: 1, done: 1 },
      { id: 2, done: 1 },
      { id: 3, done: 0 },
    ];
    expect(isLastUndoneForDay(items, 3, true)).toBe(true);
  });

  it("is false when checking an item while another one is still undone", () => {
    expect(isLastUndoneForDay(dayItems, 3, true)).toBe(false);
  });

  it("is false on any uncheck, even the day's only item", () => {
    expect(isLastUndoneForDay([{ id: 1, done: 1 }], 1, false)).toBe(false);
  });

  it("is true when a day has only one item and it is checked", () => {
    expect(isLastUndoneForDay([{ id: 1, done: 0 }], 1, true)).toBe(true);
  });

  it("does not count the toggled item itself against the others", () => {
    // Even though the toggled item's own `done` still reads 0 here (the
    // write has not landed yet), it must not be counted as "still undone".
    const items = [
      { id: 1, done: 1 },
      { id: 2, done: 0 },
    ];
    expect(isLastUndoneForDay(items, 2, true)).toBe(true);
  });
});
