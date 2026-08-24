// Course reads and writes. No ordering by name happens here: SQL `ORDER BY`
// compares bytes and would place `Éducation physique` after `Zoologie`, so
// courses are sorted with `localeCompare` in JavaScript (milestone 5's helpers).
// The `ORDER BY created_at, id` below is only there to make the result stable.
//
// Rows come back with their column names untouched (`archived_at`, `created_at`):
// this layer translates calls to SQL and back, and maps nothing.
import { getDatabase } from "@/db/client";

// Instants are ISO-8601 UTC strings such as `2026-08-21T09:14:03Z`, and are
// passed in rather than read from the clock here — see `specs/data-model.md`.

export async function listCourses() {
  const db = await getDatabase();
  return db.select(
    "SELECT id, name, archived_at, created_at FROM courses ORDER BY created_at, id",
  );
}

// Returns the new course id.
export async function createCourse(name, createdAt) {
  const db = await getDatabase();
  const { lastInsertId } = await db.execute(
    "INSERT INTO courses (name, archived_at, created_at) VALUES ($1, NULL, $2)",
    [name, createdAt],
  );
  return lastInsertId;
}

export async function renameCourse(id, name) {
  const db = await getDatabase();
  await db.execute("UPDATE courses SET name = $1 WHERE id = $2", [name, id]);
}

// Deleting a course in the user interface archives it. Nothing in this file
// issues `DELETE FROM courses`, and nothing ever should: entries keep displaying
// the real name of a course the user removed.
export async function archiveCourse(id, archivedAt) {
  const db = await getDatabase();
  await db.execute("UPDATE courses SET archived_at = $1 WHERE id = $2", [
    archivedAt,
    id,
  ]);
}
