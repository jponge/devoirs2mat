//! Schema migrations for `sqlite:homework.db`.
//!
//! This module is the one deliberate exception to "the code is written in
//! JavaScript": `tauri-plugin-sql` requires migrations to be declared on the
//! Rust side. It holds DDL and nothing else — every `SELECT`, `INSERT`,
//! `UPDATE` and `DELETE` lives in `src/db/` and goes through the plugin's
//! JavaScript API.
//!
//! Migrations are append-only: never edit one that has already shipped. Adding
//! one means appending an entry below *and* bumping `SCHEMA_VERSION` in
//! `src/db/schema.js`, which the export header carries.
//!
//! The DDL is a faithful translation of `specs/data-model.md`. Three details
//! that look like mistakes but are not:
//!
//! - `homework.text` is `NOT NULL` and **may be the empty string**. An entry can
//!   be saved before its text is written, so no constraint may reject it.
//! - `courses_active_name` is a *partial* unique index. Two active courses may
//!   not share a name, but an archived course may share its name with an active
//!   one — that is what lets a user re-create a course they deleted.
//! - the `due_date` pattern spells out `[0-9]` eight times rather than using
//!   `_`. `_` is a `LIKE` wildcard, **not** a `GLOB` one: in `GLOB` it is a
//!   literal underscore, so `GLOB '____-__-__'` matches only the string
//!   `____-__-__` and rejects every real date. This was found by running it.

use tauri_plugin_sql::{Migration, MigrationKind};

/// The migrations, in the order the plugin must apply them.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create courses, homework and settings",
        sql: r#"
CREATE TABLE courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    archived_at TEXT,
    created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX courses_active_name ON courses (name) WHERE archived_at IS NULL;

CREATE TABLE homework (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    due_date   TEXT NOT NULL CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    course_id  INTEGER NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
    done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE INDEX homework_due_date ON homework (due_date);
CREATE INDEX homework_course_id ON homework (course_id);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
"#,
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    // These guard the *list*, not the SQL. The realistic failure is a future
    // append going wrong — a duplicated version, a gap, a `Down` pasted in by
    // accident — and every one of those fails at runtime, on a user's database,
    // rather than at build time.

    #[test]
    fn starts_at_version_one_and_is_contiguous() {
        let migrations = migrations();
        assert!(!migrations.is_empty(), "there is at least one migration");

        for (index, migration) in migrations.iter().enumerate() {
            assert_eq!(
                migration.version,
                index as i64 + 1,
                "migration versions run 1, 2, 3, … in order with no gaps"
            );
        }
    }

    #[test]
    fn descriptions_are_unique_and_non_empty() {
        let migrations = migrations();
        let mut seen = HashSet::new();

        for migration in &migrations {
            assert!(
                !migration.description.trim().is_empty(),
                "migration {} has a description",
                migration.version
            );
            assert!(
                seen.insert(migration.description),
                "migration description {:?} is used twice",
                migration.description
            );
        }
    }

    #[test]
    fn every_migration_is_an_up() {
        for migration in &migrations() {
            assert!(
                matches!(migration.kind, MigrationKind::Up),
                "migration {} is an Up migration",
                migration.version
            );
        }
    }

    #[test]
    fn every_migration_has_sql() {
        for migration in &migrations() {
            assert!(
                !migration.sql.trim().is_empty(),
                "migration {} has SQL",
                migration.version
            );
        }
    }
}
