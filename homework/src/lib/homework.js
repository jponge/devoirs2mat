// Homework validation: pure, no React, no i18next, no `src/db/`.
//
// The only required field is the course (`specs/functional-specs.md`), mirroring
// the reason-key pattern `src/lib/courses.js` uses for course names: this
// returns a reason KEY rather than a translated string, so the caller owns the
// catalogs and this module does not know they exist.

// `null` when `courseId` is fine to save, otherwise `"required"`.
//
// `courseId` must also be one of `courseOptions` — not just non-null. A course
// picked in an open edit or quick-add draft can be archived out from under it
// by a concurrent action (the side panel stays reachable while a draft is
// open), at which point it silently drops out of the picker's option list;
// without this check the id would still be a real number and would save
// anyway, attaching the entry to a course the student never actually
// confirmed once it disappeared.
export function validateHomeworkCourseId(courseId, courseOptions) {
  if (courseId === null || courseId === undefined) {
    return "required";
  }
  return courseOptions.some((course) => course.id === courseId) ? null : "required";
}

// Whether toggling `toggledItemId` to `checked` makes every homework entry
// due this day complete. `dayItems` must already be filtered to one
// `due_date` by the caller — this function knows nothing about dates.
//
// Stateless by design: it answers the question fresh from `dayItems` every
// time, with no "already celebrated today" memory. The toggled item's own
// `done` value is never read, since the write it belongs to has not landed
// yet when this runs — only `checked`, the value it is about to become,
// decides the outcome for that one item.
export function isLastUndoneForDay(dayItems, toggledItemId, checked) {
  if (!checked) {
    return false;
  }
  return dayItems.every((item) => item.id === toggledItemId || item.done === 1);
}
