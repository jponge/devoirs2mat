import { describe, it, expect } from "vitest";
import { generateExport, parseExport, validateExport, SqlImportError } from "@/lib/sql-export";
import { SCHEMA_VERSION } from "@/db/schema";

const COURSES = [
  { id: 1, name: "Maths", color: "#22c55e", archived_at: null, created_at: "2026-08-01T09:00:00Z" },
  {
    id: 2,
    name: "Latin",
    color: "#6b7280",
    archived_at: "2026-08-20T10:00:00Z",
    created_at: "2026-08-01T09:00:00Z",
  },
];

const HOMEWORK = [
  {
    id: 1,
    text: "Exercices 4 à 7; **relis** le chapitre.\nEt regarde ceci : [site](https://example.com) — c'est utile.",
    due_date: "2026-08-25",
    course_id: 1,
    done: 0,
    created_at: "2026-08-20T08:00:00Z",
  },
  { id: 2, text: "", due_date: "2026-08-26", course_id: 2, done: 1, created_at: "2026-08-21T08:00:00Z" },
];

const SETTINGS = [{ key: "language", value: "fr" }];

describe("generateExport / parseExport round trip", () => {
  it("reproduces courses, homework and settings exactly, including text with semicolons, quotes, newlines and Markdown", () => {
    const text = generateExport(COURSES, HOMEWORK, SETTINGS);

    const parsed = parseExport(text);

    expect(parsed).toEqual({
      schemaVersion: SCHEMA_VERSION,
      courses: COURSES,
      homework: HOMEWORK,
      settings: SETTINGS,
    });
  });

  it("round trips an entirely empty database", () => {
    const text = generateExport([], [], []);

    expect(parseExport(text)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      courses: [],
      homework: [],
      settings: [],
    });
  });

  // `courses.archived_at` distinguishes "never archived" (NULL) from any other
  // value — losing that on a round trip would silently un-archive a course.
  it("keeps NULL distinct from an empty string", () => {
    const text = generateExport(
      [{ id: 1, name: "Maths", color: "#22c55e", archived_at: null, created_at: "2026-08-01T09:00:00Z" }],
      [],
      [],
    );

    expect(parseExport(text).courses[0].archived_at).toBeNull();
  });

  it("survives a value that is only a quote", () => {
    const text = generateExport(
      [],
      [
        {
          id: 1,
          text: "'",
          due_date: "2026-08-25",
          course_id: 1,
          done: 0,
          created_at: "2026-08-20T08:00:00Z",
        },
      ],
      [],
    );

    expect(parseExport(text).homework[0].text).toBe("'");
  });
});

describe("the export header", () => {
  it("opens with the exact required format", () => {
    const text = generateExport([], [], []);

    expect(text.startsWith(`-- devoirs schema-version: ${SCHEMA_VERSION}\n`)).toBe(true);
  });

  it("contains no other tables, in particular never _sqlx_migrations", () => {
    const text = generateExport(COURSES, HOMEWORK, SETTINGS);

    expect(text).not.toMatch(/_sqlx_migrations/);
  });
});

describe("parseExport rejecting bad input", () => {
  it("rejects empty content", () => {
    expect(() => parseExport("")).toThrow(SqlImportError);
    try {
      parseExport("");
    } catch (error) {
      expect(error.reason).toBe("empty");
    }
  });

  it("rejects a missing header", () => {
    expect(() => parseExport("INSERT INTO courses (id) VALUES (1);\n")).toThrow(SqlImportError);
    try {
      parseExport("INSERT INTO courses (id) VALUES (1);\n");
    } catch (error) {
      expect(error.reason).toBe("badHeader");
    }
  });

  // The header text changed with the application's rename from Devoirs2mat to
  // Devoirs, an explicit, accepted break: a backup exported before that change
  // is no longer importable. Pinned here so that consequence stays a decision,
  // not a silent regression.
  it("rejects a pre-rename export, whose header still says devoirs2mat", () => {
    const text = `-- devoirs2mat schema-version: ${SCHEMA_VERSION}\n`;
    expect(() => parseExport(text)).toThrow(SqlImportError);
    try {
      parseExport(text);
    } catch (error) {
      expect(error.reason).toBe("badHeader");
    }
  });

  // A mismatched schema version is refused outright rather than partially
  // applied — the caller checks `schemaVersion`, but parsing itself must still
  // succeed so the caller can compare it against the current constant.
  it("still parses a well-formed body with a different schema version, reporting the version", () => {
    const text = `-- devoirs schema-version: 999\n`;

    expect(parseExport(text).schemaVersion).toBe(999);
  });

  it("rejects malformed statements without partially parsing", () => {
    const text = `-- devoirs schema-version: ${SCHEMA_VERSION}\nINSERT INTO courses (id, name) VALUES (1);\n`;

    expect(() => parseExport(text)).toThrow(SqlImportError);
    try {
      parseExport(text);
    } catch (error) {
      expect(error.reason).toBe("malformed");
    }
  });

  // `Number("")` is `0`, not `NaN` — a blank value token (a hand-edited or
  // truncated file) must be refused, not silently turned into the number `0`
  // in what is meant to be a `TEXT NOT NULL` column.
  it("rejects a blank value token rather than parsing it as 0", () => {
    const text = `-- devoirs schema-version: ${SCHEMA_VERSION}\nINSERT INTO settings (key, value) VALUES ('language',);\n`;

    expect(() => parseExport(text)).toThrow(SqlImportError);
    try {
      parseExport(text);
    } catch (error) {
      expect(error.reason).toBe("malformed");
    }
  });

  it("rejects an unknown table", () => {
    const text = `-- devoirs schema-version: ${SCHEMA_VERSION}\nINSERT INTO _sqlx_migrations (id) VALUES (1);\n`;

    expect(() => parseExport(text)).toThrow(SqlImportError);
  });

  it("rejects a statement missing its trailing semicolon", () => {
    const text = `-- devoirs schema-version: ${SCHEMA_VERSION}\nINSERT INTO settings (key, value) VALUES ('language', 'fr')`;

    expect(() => parseExport(text)).toThrow(SqlImportError);
  });

  // The whole reason the parser cannot naively split on `;`: one legitimately
  // appears inside a homework entry's own text.
  it("does not treat a semicolon inside a quoted value as a statement boundary", () => {
    const text =
      `-- devoirs schema-version: ${SCHEMA_VERSION}\n` +
      `INSERT INTO homework (id, text, due_date, course_id, done, created_at) VALUES (1, 'a; b', '2026-08-25', 1, 0, '2026-08-20T08:00:00Z');\n`;

    const parsed = parseExport(text);

    expect(parsed.homework).toHaveLength(1);
    expect(parsed.homework[0].text).toBe("a; b");
  });
});

describe("validateExport", () => {
  it("returns the parsed data when the version matches", () => {
    const text = generateExport([], [], []);

    expect(validateExport(text)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      courses: [],
      homework: [],
      settings: [],
    });
  });

  it("refuses a mismatched schema version, distinctly from a bad header", () => {
    const text = `-- devoirs schema-version: ${SCHEMA_VERSION + 1}\n`;

    expect(() => validateExport(text)).toThrow(SqlImportError);
    try {
      validateExport(text);
    } catch (error) {
      expect(error.reason).toBe("versionMismatch");
    }
  });

  it("still refuses structurally invalid content the same way parseExport does", () => {
    expect(() => validateExport("")).toThrow(SqlImportError);
  });
});
