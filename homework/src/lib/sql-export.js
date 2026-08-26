// The SQL export/import format: pure, no React, no i18next, no `src/db/`
// connection — `src/db/schema.js` is the one exception, and it costs nothing
// because that module is itself just a constant with no database dependency.
//
// `generateExport` and `parseExport` are a matched pair. The generator writes
// one `INSERT INTO <table> (<columns>) VALUES (<values>);` statement per row,
// never a multi-row `VALUES (...), (...)`, which keeps the parser simple and
// the file human-readable. The parser is a small, deliberately scoped
// tokenizer for exactly that shape — not a general SQL parser — and its whole
// reason for existing rather than a naive `text.split(";")` is that homework
// text may legitimately contain a semicolon inside its own quoted value.
import { SCHEMA_VERSION } from "@/db/schema";

const HEADER_RE = /^-- devoirs2mat schema-version: (\d+)\s*$/;

const COLUMNS = {
  courses: ["id", "name", "color", "archived_at", "created_at"],
  homework: ["id", "text", "due_date", "course_id", "done", "created_at"],
  settings: ["key", "value"],
};

// A reason KEY, not a translated string — mirrors `src/lib/courses.js` and
// `src/lib/homework.js`: this module does not know the catalogs exist, so the
// caller owns turning `"badHeader"` into copy.
export class SqlImportError extends Error {
  constructor(reason) {
    super(`invalid export data: ${reason}`);
    this.reason = reason;
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertStatement(table, row) {
  const columns = COLUMNS[table];
  const values = columns.map((column) => sqlValue(row[column]));
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

// `courses`, then `homework`, then `settings` — courses first because
// homework references them, readable top to bottom even though the import
// step controls its own delete/insert order rather than trusting file order.
export function generateExport(courses, homework, settings) {
  const lines = [`-- devoirs2mat schema-version: ${SCHEMA_VERSION}`];
  for (const row of courses) {
    lines.push(insertStatement("courses", row));
  }
  for (const row of homework) {
    lines.push(insertStatement("homework", row));
  }
  for (const row of settings) {
    lines.push(insertStatement("settings", row));
  }
  return lines.join("\n") + "\n";
}

// Splits `sql` into individual statements (each still ending in its own
// `;`), tracking whether the scan is inside a quoted string so an embedded
// semicolon or parenthesis is never mistaken for structure. `''` inside a
// string is SQL's own escaped single quote, not a boundary.
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    current += char;
    if (char === "'") {
      if (inString && sql[i + 1] === "'") {
        current += sql[i + 1];
        i += 1;
        continue;
      }
      inString = !inString;
    } else if (char === ";" && !inString) {
      const trimmed = current.trim();
      if (trimmed !== "") {
        statements.push(trimmed);
      }
      current = "";
    }
  }
  if (current.trim() !== "") {
    // Content survives after the last `;` — a truncated file, most likely.
    throw new SqlImportError("malformed");
  }
  return statements;
}

// Splits a `VALUES (...)` tuple's inner text on top-level commas, the same
// quote-tracking rule as `splitStatements`.
function splitValues(text) {
  const values = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'") {
      if (inString && text[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inString = !inString;
      current += char;
    } else if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseValue(token) {
  if (token === "NULL") {
    return null;
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1).replace(/''/g, "'");
  }
  // `Number("")` is `0`, not `NaN` — without this check a blank value token
  // (e.g. `VALUES ('a',)`, from a hand-edited or truncated file) would parse
  // to the number `0` instead of being refused, silently corrupting a
  // `TEXT NOT NULL` column's type rather than failing the import outright.
  if (token === "") {
    throw new SqlImportError("malformed");
  }
  const number = Number(token);
  if (Number.isNaN(number)) {
    throw new SqlImportError("malformed");
  }
  return number;
}

const INSERT_PREFIX_RE = /^INSERT INTO (\w+) \(([^)]*)\) VALUES \(/;

// `statement` already ends with its own `;`, courtesy of `splitStatements`.
// The values tuple's own closing `)` is structurally the last character of
// the statement once that `;` is stripped — true regardless of what a text
// value itself contains, including a literal `)` of its own.
function parseInsertStatement(statement) {
  if (!statement.endsWith(";")) {
    throw new SqlImportError("malformed");
  }
  const withoutSemicolon = statement.slice(0, -1).trimEnd();
  const prefixMatch = withoutSemicolon.match(INSERT_PREFIX_RE);
  if (prefixMatch === null || !withoutSemicolon.endsWith(")")) {
    throw new SqlImportError("malformed");
  }

  const table = prefixMatch[1];
  if (!(table in COLUMNS)) {
    throw new SqlImportError("malformed");
  }

  const columns = prefixMatch[2].split(",").map((column) => column.trim());
  const valuesText = withoutSemicolon.slice(prefixMatch[0].length, -1);
  const values = splitValues(valuesText);
  if (values.length !== columns.length) {
    throw new SqlImportError("malformed");
  }

  const row = {};
  columns.forEach((column, index) => {
    row[column] = parseValue(values[index]);
  });
  return { table, row };
}

// `{ schemaVersion, courses, homework, settings }`, or throws `SqlImportError`
// with a reason (`"empty"`, `"badHeader"`, `"malformed"`) the caller maps to
// catalog copy. The schema version itself is reported, not compared here —
// comparing against the current constant is the caller's job, so that a
// mismatch can be reported as "refused outright" without this module needing
// to know what "refused" means to the UI.
export function parseExport(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new SqlImportError("empty");
  }

  const newlineIndex = text.indexOf("\n");
  const headerLine = newlineIndex === -1 ? text : text.slice(0, newlineIndex);
  const body = newlineIndex === -1 ? "" : text.slice(newlineIndex + 1);

  const headerMatch = headerLine.match(HEADER_RE);
  if (headerMatch === null) {
    throw new SqlImportError("badHeader");
  }
  const schemaVersion = Number(headerMatch[1]);

  const tables = { courses: [], homework: [], settings: [] };
  for (const statement of splitStatements(body)) {
    const { table, row } = parseInsertStatement(statement);
    tables[table].push(row);
  }
  return { schemaVersion, ...tables };
}

// `parseExport`, plus the one check it deliberately leaves to its caller: that
// the file's schema version is the one this build produces. The single place
// both `importDatabase` and the side panel's pre-confirmation check call, so
// the comparison exists exactly once rather than drifting between the two.
export function validateExport(text) {
  const parsed = parseExport(text);
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new SqlImportError("versionMismatch");
  }
  return parsed;
}
