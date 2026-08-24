// Instants: when something happened in the application.
//
// The data model has two kinds of time and they are deliberately different types
// of value. A *calendar date* (`homework.due_date`) is `YYYY-MM-DD` with no time
// and no zone, and lives in the date helpers. An *instant* (`created_at`,
// `archived_at`) is an ISO-8601 UTC string like `2026-08-21T09:14:03Z`, and is
// never shown as a due date.
//
// The format matters more than it looks. `created_at` is the sort key inside a
// group (`ORDER BY created_at, id`), the comparison is a string comparison, and
// `.` sorts before `Z`. So a database mixing `…:03.500Z` with `…:03Z` orders the
// later entry first:
//
//   2026-08-21T09:14:03.500Z
//   2026-08-21T09:14:03Z
//
// `toISOString()` produces the millisecond form, so calling it directly is the
// wrong thing everywhere. Use this instead, and pass the result into `src/db/`,
// which never reads the clock itself.

// `clock` is injectable so tests do not depend on the real time.
export function nowInstant(clock = Date.now) {
  return new Date(clock()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
