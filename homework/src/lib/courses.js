// Course-name validation: pure, no React, no i18next, no `src/db/`.
//
// `specs/data-model.md` line 55 treats the database's unique index as a
// backstop, not validation: "the course form trims before it saves". So the
// trimming and the duplicate check both live here, ahead of any write, and
// return a reason KEY rather than a translated string — the caller owns the
// catalogs, this module does not know they exist.
//
// Duplicate checks compare names the same way `src/lib/grouping.js` orders
// them: with `localeCompare` in JavaScript, never with SQL, which is the
// `Éducation physique` / `Zoologie` rule from the functional specs. Here that
// means case is ignored but accents are not, so `"maths"` collides with
// `"Maths"` while `"Ecole"` and `"École"` stay distinct courses.
//
// Only an ACTIVE course (`archived_at` null or undefined) blocks a name:
// `specs/data-model.md` line 50 allows a new course to reuse a name an
// archived one left behind, which is what lets a student re-create a course
// they deleted by mistake.

const SAME_NAME_SENSITIVITY = "accent";

function sameName(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: SAME_NAME_SENSITIVITY }) === 0;
}

// Exported: the editor lists active courses, and the main view decides whether
// to show its first-run state from the same rule. Three inlined copies of this
// comparison is how they drift apart.
export function isActiveCourse(course) {
  return course.archived_at === null || course.archived_at === undefined;
}

// Trims; collapses nothing else. `"  Maths  "` and `"Maths"` must save as the
// same course, but internal spacing is the student's to keep.
export function normalizeCourseName(name) {
  return name.trim();
}

// `null` when `name` is fine to save, otherwise `"empty"` or `"duplicate"`.
//
// `excludeId`, when given, is the id of the course being renamed: renaming a
// course to its own current name is not a duplicate of itself.
export function validateCourseName(name, courses, excludeId) {
  const normalized = normalizeCourseName(name);
  if (normalized === "") {
    return "empty";
  }

  const clashes = courses.some((course) => {
    if (course.id === excludeId) {
      return false;
    }
    if (!isActiveCourse(course)) {
      return false;
    }
    return sameName(course.name, normalized);
  });

  return clashes ? "duplicate" : null;
}
