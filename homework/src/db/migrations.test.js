// @vitest-environment node
//
// The schema, executed against a real SQLite engine.
//
// This exists because the `due_date` CHECK shipped broken: the data model
// specified `GLOB '____-__-__'`, but `_` is a `LIKE` wildcard and a literal
// underscore in `GLOB`, so it rejected every real date and accepted only the
// pattern string itself. It had been through a spec review and was caught only by
// running the application. Nothing in the suite could have caught it: vitest
// cannot run the Tauri plugin, and the Rust tests only guard the migration list.
//
// So the DDL is extracted from `migrations.rs` and executed here with `node:sqlite`,
// which ships with Node and costs no dependency. What this proves is that the
// schema text means what we think it means at SQLite 3.53.x. It is not an
// integration test: it does not exercise the plugin, sqlx, or the real database
// file, and it never will.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsRs = readFileSync(
  fileURLToPath(new URL("../../src-tauri/src/migrations.rs", import.meta.url)),
  "utf8",
);

// The DDL lives in a Rust raw string: sql: r#"…"#
function extractSql(source) {
  const match = source.match(/sql:\s*r#"([\s\S]*?)"#/);
  if (match === null) {
    throw new Error("could not find the migration SQL in migrations.rs");
  }
  return match[1];
}

const INSTANT = "2026-08-21T09:14:03Z";
let db;

// A course row is needed before most homework rows can exist.
function insertCourse(name, archivedAt = null, color = "#ef4444") {
  db.prepare(
    "INSERT INTO courses (name, color, archived_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(name, color, archivedAt, INSTANT);
}

function insertHomework({ text = "", dueDate = "2026-08-25", courseId = 1, done = 0 }) {
  db.prepare(
    "INSERT INTO homework (text, due_date, course_id, done, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(text, dueDate, courseId, done, INSTANT);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  // Foreign keys are off by default in raw SQLite. sqlx turns them on for every
  // connection it opens, so enabling them here mirrors the application rather
  // than flattering the schema.
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(extractSql(migrationsRs));
});

describe("courses", () => {
  it("rejects a blank name", () => {
    expect(() => insertCourse("   ")).toThrow(/CHECK constraint failed/);
  });

  it("rejects a second active course with the same name", () => {
    insertCourse("Zoologie");
    expect(() => insertCourse("Zoologie")).toThrow(/UNIQUE constraint failed/);
  });

  it("allows re-creating a name whose course was archived", () => {
    insertCourse("Zoologie", INSTANT);
    expect(() => insertCourse("Zoologie")).not.toThrow();
  });

  it("accepts a well-formed lowercase hex color", () => {
    expect(() => insertCourse("Zoologie", null, "#ef4444")).not.toThrow();
  });

  it("rejects a color that is not lowercase 6-digit hex", () => {
    for (const color of ["ef4444", "#EF4444", "#fff", "#ef44444", "#gggggg", ""]) {
      expect(() => insertCourse("Zoologie", null, color)).toThrow(/CHECK constraint failed/);
    }
  });
});

describe("homework", () => {
  beforeEach(() => insertCourse("Zoologie"));

  // Specified explicitly: an entry can be saved with no text yet.
  it("accepts empty text", () => {
    expect(() => insertHomework({ text: "" })).not.toThrow();
  });

  // The bug this whole file exists for.
  it("accepts a real calendar date", () => {
    expect(() => insertHomework({ dueDate: "2026-08-25" })).not.toThrow();
  });

  it("rejects a due date that is not YYYY-MM-DD", () => {
    for (const dueDate of ["2026-8-1", "abcd-ef-gh", "____-__-__", "", "2026-08-25T00:00:00Z"]) {
      expect(() => insertHomework({ dueDate })).toThrow(/CHECK constraint failed/);
    }
  });

  it("rejects a done value that is not 0 or 1", () => {
    expect(() => insertHomework({ done: 2 })).toThrow(/CHECK constraint failed/);
  });

  it("rejects an entry whose course does not exist", () => {
    expect(() => insertHomework({ courseId: 999 })).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("refuses to delete a course that still has homework", () => {
    insertHomework({});
    expect(() => db.prepare("DELETE FROM courses WHERE id = 1").run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe("settings", () => {
  // A TEXT PRIMARY KEY is nullable in a non-STRICT table, which would let
  // unreadable rows accumulate that no upsert can ever reach.
  it("rejects a null key", () => {
    expect(() =>
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(null, "en"),
    ).toThrow(/NOT NULL constraint failed/);
  });

  it("upserts on a repeated key", () => {
    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    );
    upsert.run("language", "en");
    upsert.run("language", "fr");

    const rows = db.prepare("SELECT value FROM settings WHERE key = 'language'").all();
    expect(rows).toEqual([{ value: "fr" }]);
  });
});
