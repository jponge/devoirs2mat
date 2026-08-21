# Data model

This document defines the intended shape of the SQLite database. It is the reference used to write the actual
migrations; it is not itself the schema. When a migration changes the database, update this document in the same
change.

Conventions used everywhere:

- Primary keys are `INTEGER PRIMARY KEY AUTOINCREMENT`. They are local identifiers with no meaning outside this
  database, which is fine because importing is a full replace and never a merge (see the functional specifications)
- SQLite has no boolean type: flags are `INTEGER` constrained to `0` or `1`
- SQLite has no date type: dates are `TEXT`, and there are two distinct kinds of them, described below

## The two kinds of time

Mixing these up is the single most likely source of wrong-day bugs, so they are deliberately different types of value:

- **Calendar dates** (`homework.due_date`) are `YYYY-MM-DD`, with no time and no time zone. A due date is "Tuesday the
  9th", not an instant. Never convert one to UTC, never build it from a `Date`, never store it as epoch milliseconds
- **Instants** (`created_at`, `archived_at`) are ISO-8601 UTC strings such as `2026-08-21T09:14:03Z`. They record when
  something happened in the application and are never shown as a due date

## `courses`

The subjects a homework entry belongs to. Courses are soft-deleted so that entries created against a course keep
displaying its real name forever, and so that a SQL export never refers to a course row that no longer exists.

| column        | type            | notes                                                              |
|---------------|-----------------|--------------------------------------------------------------------|
| `id`          | INTEGER PK      | autoincrement                                                       |
| `name`        | TEXT NOT NULL   | non-empty, as typed by the user                                     |
| `archived_at` | TEXT NULL       | `NULL` means active; an instant means deleted by the user           |
| `created_at`  | TEXT NOT NULL   | instant                                                             |

```sql
-- intended shape, not a migration
CREATE TABLE courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    archived_at TEXT,
    created_at  TEXT NOT NULL
);

-- Two active courses may not share a name, but an archived course may share its name with an active one:
-- that is what allows the user to re-create a course they previously deleted.
CREATE UNIQUE INDEX courses_active_name ON courses (name) WHERE archived_at IS NULL;
```

Deleting a course in the user interface sets `archived_at`. Nothing ever issues `DELETE FROM courses`.

## `homework`

One homework entry. This is the central table and everything in the daily and weekly views reads from it.

| column       | type              | notes                                                             |
|--------------|-------------------|-------------------------------------------------------------------|
| `id`         | INTEGER PK        | autoincrement                                                      |
| `text`       | TEXT NOT NULL     | Markdown source as typed; may be empty, see below                  |
| `due_date`   | TEXT NOT NULL     | calendar date, `YYYY-MM-DD`                                        |
| `course_id`  | INTEGER NOT NULL  | references `courses(id)`; mandatory, and the course may be archived |
| `done`       | INTEGER NOT NULL  | `0` or `1`, defaults to `0`                                        |
| `created_at` | TEXT NOT NULL     | instant; also the sort key inside a group                          |

```sql
-- intended shape, not a migration
CREATE TABLE homework (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    due_date   TEXT NOT NULL CHECK (due_date GLOB '____-__-__'),
    course_id  INTEGER NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
    done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE INDEX homework_due_date ON homework (due_date);
CREATE INDEX homework_course_id ON homework (course_id);
```

`text` holds the Markdown source exactly as the student typed it. Never store rendered HTML and never store a
sanitized or normalized variant: rendering is a display concern, and the database keeps the original characters so
that a SQL export stays readable and portable.

`text` is `NOT NULL` but may be the empty string, and that is deliberate. An entry can be saved with no text yet and
filled in later, so no form, query or migration may reject an empty `text` — being lenient here is the point.

`ON DELETE RESTRICT` is intentional: it is a guard rail, not a behaviour. Courses are archived rather than deleted, so
this clause should never fire — if it ever does, some code is doing something the specifications forbid.

Deleting a homework entry, on the other hand, is a real `DELETE` (the user confirms it first).

## `settings`

Application preferences, as untyped key/value pairs so that adding a preference never needs a migration.

| column  | type          | notes            |
|---------|---------------|------------------|
| `key`   | TEXT PK       |                  |
| `value` | TEXT NOT NULL | parsed by the reader |

```sql
-- intended shape, not a migration
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Because a key may be absent, every reader defines its default in one place. Known keys:

| key              | values           | default when absent                                       |
|------------------|------------------|-----------------------------------------------------------|
| `language`       | `en` or `fr`     | absent, so the system locale is detected (see functional specs) |

## Ordering rules

- Homework inside a day-and-course group: `ORDER BY created_at, id`. Completion never reorders anything, so `done`
  must not appear in any `ORDER BY`
- Courses: alphabetically, but sorted in JavaScript with `localeCompare`, never with SQL `ORDER BY`, which compares
  bytes and would place `Éducation physique` after `Zoologie`. Archived courses sort after active ones
- Days in the weekly view come from the date range, not from the data: a day with no homework still shows its block

## Invariants

1. Every homework entry resolves to exactly one course row, active or archived. There is no such thing as an entry
   without a course
2. A course is never removed, only archived. `courses.id` values are therefore stable for the life of the database
3. `due_date` is always exactly ten characters and is never compared against an instant
4. At most one active course exists per name; archived courses are exempt

## Foreign keys are off by default

SQLite does not enforce foreign keys unless `PRAGMA foreign_keys = ON` is issued **per connection**. Without it,
invariant 1 is documentation rather than a constraint. Enable it when the connection is opened.

## Migrations

- Migrations are declared on the Rust side in `src-tauri/src/migrations.rs` (see the technical stack) and are
  append-only: never edit one that has already shipped
- The plugin keeps its own bookkeeping table (`_sqlx_migrations`) recording which migrations have already been
  applied. It belongs to the plugin: never read it, write it, export it or wipe it — and never mirror it with a
  schema version of our own stored in the database, which could only drift from it

## Relationship to export and import

- An export contains `courses`, `homework` and `settings`, and nothing else. The plugin's bookkeeping table is
  excluded, so that a restore does not make the plugin believe migrations still need to run
- The `N` in the export header is a constant in the application code, bumped in the same change that adds a
  migration. Migrations run to completion at startup, so the running application constant is by definition the
  version of the database it exports. An import whose header does not match that constant is refused rather than
  partially applied
- A restore wipes and repopulates those three tables inside one transaction. It never drops or creates them, so the
  schema is always the one the migrations produced
