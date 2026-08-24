// Homework reads and writes.
//
// `due_date` values are calendar dates (`YYYY-MM-DD`), compared as strings —
// which is exactly right for that format and is why the range below needs no
// date arithmetic. They are never built from a `Date` and never converted to
// UTC. `created_at` is an instant, and is also the sort key inside a group.
//
// `done` never appears in an `ORDER BY`: completing an entry must not move it.
import { getDatabase } from "@/db/client";

const COLUMNS = "id, text, due_date, course_id, done, created_at";

// Inclusive on both ends. A single day is `from === to`.
export async function listHomeworkBetween(fromDate, toDate) {
  const db = await getDatabase();
  return db.select(
    `SELECT ${COLUMNS} FROM homework WHERE due_date BETWEEN $1 AND $2 ORDER BY created_at, id`,
    [fromDate, toDate],
  );
}

// `text` may be the empty string, deliberately: an entry can be saved before it
// has been written and filled in later. Nothing here rejects it.
export async function createHomework({ text, dueDate, courseId, createdAt }) {
  const db = await getDatabase();
  const { lastInsertId } = await db.execute(
    "INSERT INTO homework (text, due_date, course_id, done, created_at) VALUES ($1, $2, $3, 0, $4)",
    [text, dueDate, courseId, createdAt],
  );
  return lastInsertId;
}

// The editable fields. Completion is `setHomeworkDone`, which the checkbox
// writes on its own without going through the edit state.
export async function updateHomework(id, { text, dueDate, courseId }) {
  const db = await getDatabase();
  await db.execute(
    "UPDATE homework SET text = $1, due_date = $2, course_id = $3 WHERE id = $4",
    [text, dueDate, courseId, id],
  );
}

export async function setHomeworkDone(id, done) {
  const db = await getDatabase();
  await db.execute("UPDATE homework SET done = $1 WHERE id = $2", [
    done ? 1 : 0,
    id,
  ]);
}

// A real `DELETE`, unlike courses: the user confirms it first and it is final.
export async function deleteHomework(id) {
  const db = await getDatabase();
  await db.execute("DELETE FROM homework WHERE id = $1", [id]);
}
