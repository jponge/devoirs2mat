import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listHomeworkBetween,
  createHomework,
  updateHomework,
  setHomeworkDone,
  deleteHomework,
} from "@/db/homework";

const { select, execute, load } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

beforeEach(() => {
  load.mockResolvedValue({ select, execute });
  select.mockResolvedValue([]);
  execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
});

const lastSql = (spy) => spy.mock.calls.at(-1)[0];
const lastValues = (spy) => spy.mock.calls.at(-1)[1];

describe("listHomeworkBetween", () => {
  it("binds the range and returns the rows untouched", async () => {
    const rows = [{ id: 1, text: "", due_date: "2026-08-24", course_id: 3, done: 0, created_at: "2026-08-21T09:14:03Z" }];
    select.mockResolvedValue(rows);

    const result = await listHomeworkBetween("2026-08-24", "2026-08-29");

    expect(result).toBe(rows);
    expect(lastValues(select)).toEqual(["2026-08-24", "2026-08-29"]);
    // The bind values alone do not pin the query: `> $1 AND < $2` would drop the
    // first and last day of the week, and `BETWEEN $2 AND $1` would return
    // nothing at all. Both pass an assertion that only looks at the parameters.
    expect(lastSql(select)).toMatch(/due_date\s+between\s+\$1\s+and\s+\$2/i);
  });

  // A single day is the same call with both ends equal — the daily view needs no
  // second query.
  it("covers one day when both ends are the same date", async () => {
    await listHomeworkBetween("2026-08-24", "2026-08-24");

    expect(lastValues(select)).toEqual(["2026-08-24", "2026-08-24"]);
  });

  it("orders by creation time and then id", async () => {
    await listHomeworkBetween("2026-08-24", "2026-08-29");

    expect(lastSql(select)).toMatch(/order\s+by\s+created_at\s*,\s*id/i);
  });

  // Ticking an entry must not make it jump, so `done` may not reach any
  // comparator.
  it("never orders by done", async () => {
    await listHomeworkBetween("2026-08-24", "2026-08-29");

    expect(lastSql(select)).not.toMatch(/order\s+by[^;]*\bdone\b/i);
  });

  it("reads every column an entry has", async () => {
    await listHomeworkBetween("2026-08-24", "2026-08-29");

    for (const column of ["id", "text", "due_date", "course_id", "done", "created_at"]) {
      expect(lastSql(select)).toContain(column);
    }
  });
});

describe("createHomework", () => {
  it("inserts the entry and returns its new id", async () => {
    execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 12 });

    const id = await createHomework({
      text: "Exercices 4 à 7",
      dueDate: "2026-08-25",
      courseId: 3,
      createdAt: "2026-08-21T09:14:03Z",
    });

    expect(id).toBe(12);
    expect(lastValues(execute)).toEqual([
      "Exercices 4 à 7",
      "2026-08-25",
      3,
      "2026-08-21T09:14:03Z",
    ]);
  });

  // Deliberate, and specified: an entry can be saved before its text is written.
  // Nothing in this layer may reject an empty string.
  it("accepts empty text", async () => {
    await createHomework({
      text: "",
      dueDate: "2026-08-25",
      courseId: 3,
      createdAt: "2026-08-21T09:14:03Z",
    });

    expect(lastValues(execute)[0]).toBe("");
  });

  it("creates the entry not done", async () => {
    await createHomework({
      text: "",
      dueDate: "2026-08-25",
      courseId: 3,
      createdAt: "2026-08-21T09:14:03Z",
    });

    // `done` is a literal in the INSERT, not a bind parameter, so the bind array
    // cannot see it: asserting on the values would pass even if every new entry
    // were created already ticked.
    expect(lastSql(execute)).toMatch(/insert\s+into\s+homework/i);
    expect(lastSql(execute)).toMatch(/values\s*\(\s*\$1\s*,\s*\$2\s*,\s*\$3\s*,\s*0\s*,\s*\$4\s*\)/i);
  });
});

describe("updateHomework", () => {
  it("writes the three editable fields", async () => {
    await updateHomework(12, {
      text: "Exercices 4 à 9",
      dueDate: "2026-08-26",
      courseId: 5,
    });

    expect(lastValues(execute)).toEqual(["Exercices 4 à 9", "2026-08-26", 5, 12]);
  });

  // Completion is written by the checkbox on its own, and an edit must not undo
  // a tick made while the card was open.
  it("leaves completion alone", async () => {
    await updateHomework(12, { text: "", dueDate: "2026-08-26", courseId: 5 });

    expect(lastSql(execute)).not.toMatch(/\bdone\b/i);
  });
});

describe("setHomeworkDone", () => {
  it("stores 1 when the entry is completed", async () => {
    await setHomeworkDone(12, true);

    expect(lastValues(execute)).toEqual([1, 12]);
  });

  // SQLite has no boolean, and the column carries `CHECK (done IN (0, 1))`: a
  // raw `false` would be stored as something the constraint rejects.
  it("stores 0 when the entry is un-completed", async () => {
    await setHomeworkDone(12, false);

    expect(lastValues(execute)).toEqual([0, 12]);
  });
});

describe("deleteHomework", () => {
  // Unlike a course, an entry really is deleted — the user confirms it first.
  it("removes the entry for good", async () => {
    await deleteHomework(12);

    expect(lastSql(execute)).toMatch(/delete\s+from\s+homework/i);
    expect(lastValues(execute)).toEqual([12]);
  });
});
