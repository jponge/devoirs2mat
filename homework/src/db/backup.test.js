import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportDatabase, importDatabase } from "@/db/backup";
import { generateExport, SqlImportError } from "@/lib/sql-export";
import { SCHEMA_VERSION } from "@/db/schema";
import { DATABASE_URL } from "@/db/client";

const { select, execute, load } = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
}));
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  load.mockResolvedValue({ select, execute });
  select.mockResolvedValue([{ data: '{"courses":[],"homework":[],"settings":[]}' }]);
  execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 });
  invoke.mockResolvedValue(undefined);
});

const lastSql = (spy) => spy.mock.calls.at(-1)[0];

describe("exportDatabase", () => {
  // The atomicity property that matters: a second `select` call would be the
  // regression the single-statement JSON-aggregation design exists to
  // prevent, since the plugin does not guarantee two calls share a
  // connection or a consistent snapshot.
  it("reads the whole database with exactly one select call", async () => {
    await exportDatabase();

    expect(select).toHaveBeenCalledTimes(1);
    expect(lastSql(select)).toMatch(/json_object/i);
    expect(lastSql(select)).toMatch(/json_group_array/i);
  });

  it("never selects the plugin's own migration bookkeeping table", async () => {
    await exportDatabase();

    expect(lastSql(select)).not.toMatch(/_sqlx_migrations/);
  });

  it("returns the header and no statements for a completely empty database", async () => {
    const text = await exportDatabase();

    expect(text).toBe(generateExport([], [], []));
  });

  it("regenerates the export text from the tables the single select returns", async () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-01T09:00:00Z" }];
    const homework = [
      {
        id: 1,
        text: "Exercice 4",
        due_date: "2026-08-25",
        course_id: 1,
        done: 0,
        created_at: "2026-08-20T08:00:00Z",
      },
    ];
    const settings = [{ key: "language", value: "fr" }];
    select.mockResolvedValue([{ data: JSON.stringify({ courses, homework, settings }) }]);

    const text = await exportDatabase();

    expect(text).toBe(generateExport(courses, homework, settings));
  });
});

describe("importDatabase", () => {
  const validText = generateExport(
    [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-01T09:00:00Z" }],
    [
      {
        id: 1,
        text: "Exercice 4",
        due_date: "2026-08-25",
        course_id: 1,
        done: 0,
        created_at: "2026-08-20T08:00:00Z",
      },
    ],
    [{ key: "language", value: "fr" }],
  );

  // `tauri-plugin-sql`'s JS `execute()` runs a bare `sqlx::query`, not a
  // `sqlx::Transaction` — a script with `BEGIN`/`COMMIT` as literal text
  // gives no real rollback guarantee if a later statement fails, and this was
  // confirmed against the real app: a deliberately failing import left the
  // connection holding SQLite's write lock, breaking every write until the
  // app restarted. The restore therefore goes through a Rust command that
  // wraps it in an actual `sqlx::Transaction`, not through `db.execute`.
  const lastInvokeArgs = () => invoke.mock.calls.at(-1)[1];

  it("runs the whole restore as exactly one Rust command call, never db.execute", async () => {
    await importDatabase(validText);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("import_homework_database");
    expect(execute).not.toHaveBeenCalled();
  });

  it("targets the same database URL the rest of the app uses", async () => {
    await importDatabase(validText);

    expect(lastInvokeArgs().db).toBe(DATABASE_URL);
  });

  it("does not wrap the script in BEGIN/COMMIT text itself — the Rust command owns the transaction", async () => {
    await importDatabase(validText);

    const script = lastInvokeArgs().script;
    expect(script).not.toMatch(/BEGIN/);
    expect(script).not.toMatch(/COMMIT/);
  });

  // `ON DELETE RESTRICT` on `homework.course_id` means courses cannot be
  // deleted while homework still references them.
  it("deletes homework before courses, and both before settings, in a fresh run", async () => {
    await importDatabase(validText);

    const script = lastInvokeArgs().script;
    const homeworkIndex = script.indexOf("DELETE FROM homework;");
    const coursesIndex = script.indexOf("DELETE FROM courses;");
    const settingsIndex = script.indexOf("DELETE FROM settings;");
    expect(homeworkIndex).toBeGreaterThanOrEqual(0);
    expect(homeworkIndex).toBeLessThan(coursesIndex);
    expect(coursesIndex).toBeLessThan(settingsIndex);
  });

  it("carries the restored rows as INSERT statements", async () => {
    await importDatabase(validText);

    const script = lastInvokeArgs().script;
    expect(script).toContain("INSERT INTO courses");
    expect(script).toContain("Maths");
    expect(script).toContain("INSERT INTO homework");
    expect(script).toContain("Exercice 4");
    expect(script).toContain("INSERT INTO settings");
  });

  it("refuses a bad header before ever invoking the import command", async () => {
    await expect(importDatabase("not a devoirs2mat export")).rejects.toThrow(SqlImportError);

    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a mismatched schema version before ever invoking the import command", async () => {
    const text = `-- devoirs2mat schema-version: ${SCHEMA_VERSION + 1}\n`;

    const failure = await importDatabase(text).catch((error) => error);

    expect(failure).toBeInstanceOf(SqlImportError);
    expect(failure.reason).toBe("versionMismatch");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("propagates a failure from the Rust command to its caller", async () => {
    invoke.mockRejectedValue(new Error("UNIQUE constraint failed: courses.name"));

    await expect(importDatabase(validText)).rejects.toThrow("UNIQUE constraint failed");
  });
});
