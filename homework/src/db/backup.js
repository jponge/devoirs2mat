// Reading and restoring the whole database for export/import.
//
// The read is **one** `db.select()` call, not three, so it is atomic by
// construction: a single SQLite statement is already a consistent snapshot
// for its own duration, and the plugin acquires a connection *per invoke* —
// separate `select()` calls are not guaranteed to see the same one. SQLite's
// JSON functions collapse all three tables into a single row.
//
// The write goes through the Rust command `import_homework_database` rather
// than the plugin's JS `execute()`, and this is not a stylistic choice:
// `execute()` runs a bare `sqlx::query`, not a `sqlx::Transaction`, so a
// script with `BEGIN`/`COMMIT` as literal SQL text gives no real transaction
// guarantee. A statement failing partway leaves the connection back in the
// pool still holding SQLite's write lock — confirmed against the real app,
// not assumed: every write failed afterwards until the app restarted. The
// Rust command uses an actual `sqlx::Transaction`, whose `Drop` rolls back
// automatically if `commit()` is never reached, which only Rust can give.
import { invoke } from "@tauri-apps/api/core";
import { getDatabase, DATABASE_URL } from "@/db/client";
import { generateExport, validateExport } from "@/lib/sql-export";

// `COALESCE(..., '[]')` matters: `json_group_array` over zero rows answers
// SQL `NULL`, not `'[]'`, which would otherwise turn an empty table into a
// `JSON.parse` of `null` rather than an empty array.
const EXPORT_QUERY = `
SELECT json_object(
  'courses', (SELECT COALESCE(json_group_array(json_object(
    'id', id, 'name', name, 'archived_at', archived_at, 'created_at', created_at
  )), '[]') FROM courses),
  'homework', (SELECT COALESCE(json_group_array(json_object(
    'id', id, 'text', text, 'due_date', due_date, 'course_id', course_id, 'done', done, 'created_at', created_at
  )), '[]') FROM homework),
  'settings', (SELECT COALESCE(json_group_array(json_object(
    'key', key, 'value', value
  )), '[]') FROM settings)
) AS data
`;

export async function exportDatabase() {
  const db = await getDatabase();
  const rows = await db.select(EXPORT_QUERY);
  const { courses, homework, settings } = JSON.parse(rows[0].data);
  return generateExport(courses, homework, settings);
}

// `homework` before `courses`: `ON DELETE RESTRICT` on `homework.course_id`
// would otherwise refuse to let a still-referenced course go. `settings` has
// no dependency either way. The `INSERT`s are regenerated from the parsed,
// already-validated data via `generateExport` — the same function the export
// side uses — rather than the raw file text spliced in verbatim, so nothing
// externally sourced reaches the database unvalidated.
//
// No `BEGIN`/`COMMIT` here — the Rust command wraps this in a real
// `sqlx::Transaction` itself.
function buildImportScript({ courses, homework, settings }) {
  const exportText = generateExport(courses, homework, settings);
  const inserts = exportText.slice(exportText.indexOf("\n") + 1);
  return ["DELETE FROM homework;", "DELETE FROM courses;", "DELETE FROM settings;", inserts].join(
    "\n",
  );
}

// Throws `SqlImportError` (via `validateExport`) for a structurally invalid
// file or a mismatched schema version — both before any write, so refused
// outright rather than partially applied, because the throw is reached
// before the database is ever touched.
export async function importDatabase(text) {
  const parsed = validateExport(text);
  // Opens the connection (and runs migrations) if nothing has touched the
  // database yet this session — the Rust command only looks up an already
  // loaded pool by URL, it does not open one itself.
  await getDatabase();
  await invoke("import_homework_database", {
    db: DATABASE_URL,
    script: buildImportScript(parsed),
  });
}
