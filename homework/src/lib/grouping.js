import { isCalendarDate } from "./dates.js";

// Grouping homework under its course, and ordering courses for display.
//
// Courses sort with `localeCompare` in JavaScript and never with SQL `ORDER BY`,
// which compares bytes and would place `Éducation physique` after `Zoologie`. The
// locale is passed in rather than read from i18next: it keeps these functions
// pure, and the caller already knows the active language.
//
// Archived courses sort after the active ones. A homework entry keeps displaying
// the real name of a course the user deleted, so the whole course row travels
// with the group and the view decides how to mute it.
//
// `done` appears in no comparator here, deliberately: completing an entry must
// never move it or remove it from the view.
//
// Nothing in this module knows how long a week is. `groupWeek` renders the days
// it is given, which is what makes "days come from the date range, not from the
// data" true — a day with no homework still gets its block.

// Ids are `INTEGER PRIMARY KEY`, so `a.id - b.id` is right for every row that
// comes out of `src/db/`. It answers NaN for anything else, though, and
// `Array.prototype.sort` reads NaN as 0 — the tiebreak would evaporate silently
// rather than fail. Comparing with `<` gives the same order for integers and a
// total one for everything else.
function compareIds(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

// Active before archived, then by name, then by id so the order is stable when
// an archived course shares its name with the active one that replaced it.
export function compareCourses(a, b, locale) {
  const archivedA = a.archived_at === null || a.archived_at === undefined ? 0 : 1;
  const archivedB = b.archived_at === null || b.archived_at === undefined ? 0 : 1;
  if (archivedA !== archivedB) {
    return archivedA - archivedB;
  }
  const byName = a.name.localeCompare(b.name, locale);
  if (byName !== 0) {
    return byName;
  }
  return compareIds(a.id, b.id);
}

// A new array: the caller's list is left alone.
export function sortCourses(courses, locale) {
  return [...courses].sort((a, b) => compareCourses(a, b, locale));
}

// `created_at` is an instant and instants are formatted to sort as strings, so a
// plain comparison is right here. `id` breaks the tie for two entries created in
// the same second.
//
// The `String()` is not decoration. `created_at` is `TEXT NOT NULL`, but a row
// built in memory before a refetch lands may be missing it, and comparing
// `undefined` with `<` is false in BOTH directions — the comparator would then
// answer 1 both ways, which is not an ordering, and `sort` would move the entries
// around it whose own dates are perfectly fine.
function compareHomework(a, b) {
  const left = String(a.created_at);
  const right = String(b.created_at);
  if (left !== right) {
    return left < right ? -1 : 1;
  }
  return compareIds(a.id, b.id);
}

// `[{ course, homework }]`, with a group only for the courses that have entries:
// a course heading with nothing under it is not something the views describe.
export function groupByCourse(homework, courses, locale) {
  const byId = new Map(courses.map((it) => [it.id, it]));
  const groups = new Map();

  for (const item of homework) {
    const course = byId.get(item.course_id);
    if (course === undefined) {
      // The foreign key makes this impossible (invariant 1 of the data model),
      // so it means something else is wrong. Silently dropping it would hide it.
      throw new Error(
        `homework ${item.id} references unknown course ${item.course_id}`,
      );
    }
    if (!groups.has(course.id)) {
      groups.set(course.id, { course, homework: [] });
    }
    groups.get(course.id).homework.push(item);
  }

  const grouped = [...groups.values()];
  grouped.sort((a, b) => compareCourses(a.course, b.course, locale));
  for (const group of grouped) {
    group.homework.sort(compareHomework);
  }
  return grouped;
}

// `[{ date, groups }]`, one entry per date given, in the order given, days with
// no homework included. An entry whose `due_date` is not one of them is ignored:
// the range query and the day list come from the same `weekDays` call.
export function groupWeek(homework, courses, dates, locale) {
  for (const date of dates) {
    // `dates.js` throws on a malformed date and so does this: accepting one here
    // would put `undefined` in a day heading instead of failing where the
    // mistake was made.
    if (!isCalendarDate(date)) {
      throw new Error(`invalid calendar date: ${JSON.stringify(date)}`);
    }
  }
  const byDate = new Map(dates.map((date) => [date, []]));

  for (const item of homework) {
    const day = byDate.get(item.due_date);
    if (day !== undefined) {
      day.push(item);
    }
  }

  return dates.map((date) => ({
    date,
    groups: groupByCourse(byDate.get(date), courses, locale),
  }));
}
