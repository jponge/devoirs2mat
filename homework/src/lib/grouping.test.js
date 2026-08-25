import { describe, it, expect } from "vitest";
import {
  compareCourses,
  groupByCourse,
  groupWeek,
  sortCourses,
} from "@/lib/grouping";

// Rows are shaped exactly as `src/db/` returns them: snake_case columns, nothing
// mapped. Courses are unsorted on purpose — SQL `ORDER BY` compares bytes, which
// is why the ordering lives here.

function course(id, name, { archived = false } = {}) {
  return {
    id,
    name,
    archived_at: archived ? "2026-08-21T09:14:03Z" : null,
    created_at: "2026-08-01T08:00:00Z",
  };
}

function entry(id, courseId, { at = "2026-08-21T09:14:03Z", due = "2026-08-24", done = 0 } = {}) {
  return {
    id,
    text: `entry ${id}`,
    due_date: due,
    course_id: courseId,
    done,
    created_at: at,
  };
}

describe("compareCourses and sortCourses", () => {
  it("sorts accented names the way a reader expects, not the way bytes do", () => {
    // This is the whole reason the spec forbids SQL `ORDER BY` for courses.
    const courses = [course(1, "Zoologie"), course(2, "Éducation physique")];

    expect(sortCourses(courses, "fr").map((it) => it.name)).toEqual([
      "Éducation physique",
      "Zoologie",
    ]);
    // …and the naive comparison really does get it wrong, so the assertion above
    // cannot pass for the wrong reason.
    expect("Éducation physique" < "Zoologie").toBe(false);
  });

  it("passes the locale through to localeCompare", () => {
    // Swedish sorts Ä after Z; French sorts it before. If the locale argument
    // were dropped, both of these would give the same order.
    const courses = [course(1, "Zoologie"), course(2, "Ärger")];

    expect(sortCourses(courses, "fr").map((it) => it.name)).toEqual([
      "Ärger",
      "Zoologie",
    ]);
    expect(sortCourses(courses, "sv").map((it) => it.name)).toEqual([
      "Zoologie",
      "Ärger",
    ]);
  });

  it("puts archived courses after every active one, whatever their names", () => {
    const courses = [
      course(1, "Anglais", { archived: true }),
      course(2, "Zoologie"),
    ];

    expect(sortCourses(courses, "fr").map((it) => it.name)).toEqual([
      "Zoologie",
      "Anglais",
    ]);
  });

  it("sorts archived courses alphabetically among themselves", () => {
    const courses = [
      course(1, "Zoologie", { archived: true }),
      course(2, "Anglais", { archived: true }),
      course(3, "Maths"),
    ];

    expect(sortCourses(courses, "fr").map((it) => it.name)).toEqual([
      "Maths",
      "Anglais",
      "Zoologie",
    ]);
  });

  it("breaks a name tie on id, so the order is stable", () => {
    // An archived course may share its name with the active one that replaced it.
    const active = course(7, "Maths");
    const archived = course(3, "Maths", { archived: true });

    expect(sortCourses([active, archived], "fr").map((it) => it.id)).toEqual([
      7, 3,
    ]);
    expect(compareCourses(course(9, "Maths"), course(4, "Maths"), "fr")).toBeGreaterThan(0);
  });

  it("keeps the tiebreak working when an id is not a number", () => {
    // `a.id - b.id` answers NaN for a string id, and `Array.prototype.sort` reads
    // NaN as 0: the tiebreak evaporates without a sound and the order becomes
    // whatever SQL happened to return. Ids are INTEGER today; a `<select>` value
    // and an optimistically built row are both strings.
    expect(compareCourses(course("b", "Maths"), course("a", "Maths"), "fr")).toBeGreaterThan(0);
    expect(compareCourses(course("a", "Maths"), course("b", "Maths"), "fr")).toBeLessThan(0);

    const courses = [course("z", "Maths"), course("a", "Maths"), course("m", "Maths")];

    expect(sortCourses(courses, "fr").map((it) => it.id)).toEqual(["a", "m", "z"]);
    expect(sortCourses([...courses].reverse(), "fr").map((it) => it.id)).toEqual([
      "a",
      "m",
      "z",
    ]);
  });

  it("does not mutate its argument", () => {
    const courses = [course(1, "Zoologie"), course(2, "Anglais")];

    sortCourses(courses, "fr");

    expect(courses.map((it) => it.name)).toEqual(["Zoologie", "Anglais"]);
  });
});

describe("groupByCourse", () => {
  const maths = course(1, "Maths");
  const anglais = course(2, "Anglais");
  const latin = course(3, "Latin", { archived: true });

  it("groups entries under their course, courses in alphabetical order", () => {
    const groups = groupByCourse(
      [entry(10, maths.id), entry(11, anglais.id)],
      [maths, anglais],
      "fr",
    );

    expect(groups.map((it) => it.course.name)).toEqual(["Anglais", "Maths"]);
    expect(groups.map((it) => it.homework.map((h) => h.id))).toEqual([[11], [10]]);
  });

  it("keeps the whole course row, so an archived name can be shown muted", () => {
    const groups = groupByCourse([entry(10, latin.id)], [maths, latin], "fr");

    expect(groups[0].course).toEqual(latin);
  });

  it("puts a group for an archived course after the active ones", () => {
    const groups = groupByCourse(
      [entry(10, latin.id), entry(11, maths.id)],
      [maths, latin],
      "fr",
    );

    expect(groups.map((it) => it.course.name)).toEqual(["Maths", "Latin"]);
  });

  it("orders entries inside a group by created_at, then id", () => {
    const entries = [
      entry(30, maths.id, { at: "2026-08-21T10:00:00Z" }),
      entry(12, maths.id, { at: "2026-08-21T08:00:00Z" }),
      entry(11, maths.id, { at: "2026-08-21T08:00:00Z" }),
    ];

    const [group] = groupByCourse(entries, [maths], "fr");

    expect(group.homework.map((it) => it.id)).toEqual([11, 12, 30]);
  });

  it("never lets completion reorder or remove anything", () => {
    // `done` appears in no comparator: a checked card stays exactly where it was.
    const entries = [
      entry(11, maths.id, { at: "2026-08-21T08:00:00Z" }),
      entry(12, maths.id, { at: "2026-08-21T09:00:00Z" }),
    ];
    const before = groupByCourse(entries, [maths], "fr");

    const completed = entries.map((it) =>
      it.id === 11 ? { ...it, done: 1 } : it,
    );
    const after = groupByCourse(completed, [maths], "fr");

    expect(after[0].homework.map((it) => it.id)).toEqual(
      before[0].homework.map((it) => it.id),
    );
    expect(after[0].homework[0].done).toBe(1);
  });

  it("orders entries the same way whatever order they arrive in", () => {
    // An entry with no `created_at` used to make the comparator answer 1 in both
    // directions, which is not an ordering at all — and `sort` then moved the
    // entries around it, whose own dates were perfectly fine.
    const entries = [
      entry(30, maths.id, { at: "2026-08-21T10:00:00Z" }),
      { ...entry(31, maths.id), created_at: undefined },
      entry(12, maths.id, { at: "2026-08-21T08:00:00Z" }),
    ];

    const [group] = groupByCourse(entries, [maths], "fr");
    const order = group.homework.map((it) => it.id);
    const [reversed] = groupByCourse([...entries].reverse(), [maths], "fr");

    // 12 was created before 30 and stays before it, poisoned neighbour or not.
    expect(order.indexOf(12)).toBeLessThan(order.indexOf(30));
    expect(reversed.homework.map((it) => it.id)).toEqual(order);
  });

  it("does not mutate its arguments", () => {
    // Milestone 8 feeds these arrays straight out of React state, where sorting
    // in place is a stale-render bug.
    const entries = [
      entry(30, maths.id, { at: "2026-08-21T10:00:00Z" }),
      entry(12, maths.id, { at: "2026-08-21T08:00:00Z" }),
    ];
    const courses = [latin, maths, anglais];

    groupByCourse(entries, courses, "fr");

    expect(entries.map((it) => it.id)).toEqual([30, 12]);
    expect(courses.map((it) => it.name)).toEqual(["Latin", "Maths", "Anglais"]);
  });

  it("produces no group for a course that has no entries", () => {
    const groups = groupByCourse([entry(10, maths.id)], [maths, anglais], "fr");

    expect(groups.map((it) => it.course.name)).toEqual(["Maths"]);
  });

  it("returns nothing at all for an empty day", () => {
    expect(groupByCourse([], [maths, anglais], "fr")).toEqual([]);
  });

  it("throws on an entry whose course does not exist", () => {
    // Invariant 1 of the data model: the foreign key makes this impossible, so
    // it means something else is broken. Dropping the entry would hide it.
    expect(() => groupByCourse([entry(10, 404)], [maths], "fr")).toThrow(
      /unknown course/,
    );
  });
});

describe("groupWeek", () => {
  const maths = course(1, "Maths");
  const anglais = course(2, "Anglais");
  const week = [
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
    "2026-08-23",
  ];

  it("returns exactly the days it was given, in order, empty ones included", () => {
    // Days come from the date range, never from the data: a day with no homework
    // still gets its block.
    const days = groupWeek([entry(10, maths.id, { due: "2026-08-19" })], [maths], week, "fr");

    expect(days.map((it) => it.date)).toEqual(week);
    expect(days.filter((it) => it.groups.length > 0).map((it) => it.date)).toEqual([
      "2026-08-19",
    ]);
    expect(days[0].groups).toEqual([]);
  });

  it("files each entry under its own due date, Sunday included", () => {
    const days = groupWeek(
      [
        entry(10, maths.id, { due: "2026-08-17" }),
        entry(11, anglais.id, { due: "2026-08-23" }),
      ],
      [maths, anglais],
      week,
      "fr",
    );
    const byDate = new Map(days.map((it) => [it.date, it]));

    expect(byDate.get("2026-08-17").groups[0].homework.map((it) => it.id)).toEqual([10]);
    expect(byDate.get("2026-08-23").groups[0].course.name).toBe("Anglais");
  });

  it("groups by course inside a day", () => {
    const days = groupWeek(
      [
        entry(10, maths.id, { due: "2026-08-19" }),
        entry(11, anglais.id, { due: "2026-08-19" }),
        entry(12, maths.id, { due: "2026-08-19", at: "2026-08-21T10:00:00Z" }),
      ],
      [maths, anglais],
      week,
      "fr",
    );
    const wednesday = days.find((it) => it.date === "2026-08-19");

    expect(wednesday.groups.map((it) => it.course.name)).toEqual(["Anglais", "Maths"]);
    expect(wednesday.groups[1].homework.map((it) => it.id)).toEqual([10, 12]);
  });

  it("ignores an entry falling outside the days it was given", () => {
    const days = groupWeek(
      [entry(10, maths.id, { due: "2026-09-01" })],
      [maths],
      week,
      "fr",
    );

    expect(days.every((it) => it.groups.length === 0)).toBe(true);
  });

  it("passes the locale through to the course ordering", () => {
    // Every other fixture here is ASCII, whose order is the same in any locale,
    // so dropping the argument would go unnoticed.
    const arger = course(3, "Ärger");
    const zoologie = course(4, "Zoologie");
    const entries = [
      entry(10, arger.id, { due: "2026-08-19" }),
      entry(11, zoologie.id, { due: "2026-08-19" }),
    ];
    const namesIn = (locale) =>
      groupWeek(entries, [arger, zoologie], week, locale)
        .find((it) => it.date === "2026-08-19")
        .groups.map((it) => it.course.name);

    expect(namesIn("fr")).toEqual(["Ärger", "Zoologie"]);
    expect(namesIn("sv")).toEqual(["Zoologie", "Ärger"]);
  });

  it("does not mutate its arguments", () => {
    const entries = [
      entry(11, anglais.id, { due: "2026-08-19" }),
      entry(10, maths.id, { due: "2026-08-19" }),
    ];
    const courses = [anglais, maths];
    const dates = [...week];

    groupWeek(entries, courses, dates, "fr");

    expect(entries.map((it) => it.id)).toEqual([11, 10]);
    expect(courses.map((it) => it.name)).toEqual(["Anglais", "Maths"]);
    expect(dates).toEqual(week);
  });

  it("throws on a day that is not a calendar date", () => {
    // `dates.js` throws on a malformed date; this module accepting one would put
    // `undefined` in a day heading instead of failing where the mistake was made.
    expect(() => groupWeek([], [maths], ["2026-08-17", "oops"], "fr")).toThrow(
      /invalid calendar date/,
    );
    expect(() => groupWeek([], [maths], [undefined], "fr")).toThrow(
      /invalid calendar date/,
    );
  });

  it("does not care how long a week is", () => {
    // Nothing here knows about seven days: the caller passes the dates.
    const days = groupWeek(
      [entry(10, maths.id, { due: "2026-08-18" })],
      [maths],
      ["2026-08-17", "2026-08-18"],
      "fr",
    );

    expect(days.map((it) => it.date)).toEqual(["2026-08-17", "2026-08-18"]);
  });
});
