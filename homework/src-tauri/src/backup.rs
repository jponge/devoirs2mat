//! The one Rust command this application needs: a transactional import.
//!
//! `tauri-plugin-sql`'s JS-exposed `execute` runs a bare `sqlx::query`, not a
//! `sqlx::Transaction` — embedding `BEGIN`/`COMMIT` as literal SQL text in the
//! script handed to it does not give real transaction semantics. When a
//! statement in the middle fails, the `BEGIN` has already run as an ordinary
//! statement sqlx has no record of, and the connection goes back to the pool
//! still holding SQLite's write lock — every later write then fails until the
//! app restarts. This was verified against the real app, not assumed: a
//! deliberately failing import reproduced exactly that.
//!
//! `sqlx::Transaction`'s `Drop` rolls back automatically when `commit()` is
//! never reached, which is the actual guarantee this needs, and it is only
//! available from Rust — the reason this one command exists despite
//! `specs/technical-stack.md` originally saying not to add one for import.
use sqlx::SqlitePool;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

// The transactional core, kept independent of Tauri's command/state plumbing
// so it can be tested directly against a plain pool — no app context needed.
// This is deliberately the one thing under test: `cargo check` alone cannot
// tell a script that commits from one that silently rolls back, since both
// type-check identically.
async fn run_import(pool: &SqlitePool, script: &str) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query(script).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn import_homework_database(
    db_instances: State<'_, DbInstances>,
    db: String,
    script: String,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let pool = match instances.get(&db) {
        Some(pool) => pool,
        None => return Err(format!("database not loaded: {db}")),
    };
    let DbPool::Sqlite(pool) = pool;

    run_import(pool, &script)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    // The schema, not the plugin's migration machinery — this test cares
    // about transaction behaviour, not migration bookkeeping, and
    // `migrations::migrations()` returns `tauri_plugin_sql::Migration`
    // values meant for the plugin, not something a bare `sqlx::SqlitePool`
    // can run directly.
    const SCHEMA: &str = r#"
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

CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
"#;

    const SEED_COURSE: &str =
        "INSERT INTO courses (id, name, archived_at, created_at) VALUES (1, 'Maths', NULL, '2026-01-01T00:00:00Z');";

    // Two active courses sharing a name violates `courses_active_name`,
    // failing partway through — the exact failure mode that originally left
    // a pooled connection holding the write lock.
    const FAILING_SCRIPT: &str = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Dup', NULL, '2026-01-01T00:00:00Z');
INSERT INTO courses (id, name, archived_at, created_at) VALUES (3, 'Dup', NULL, '2026-01-01T00:00:00Z');
";

    async fn seeded_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool opens");
        sqlx::query(SCHEMA)
            .execute(&pool)
            .await
            .expect("schema applies");
        sqlx::query(SEED_COURSE)
            .execute(&pool)
            .await
            .expect("seed row inserts");
        pool
    }

    async fn course_count(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM courses")
            .fetch_one(pool)
            .await
            .expect("count query succeeds")
    }

    #[tokio::test]
    async fn commits_a_successful_script() {
        let pool = seeded_pool().await;
        let script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Latin', NULL, '2026-01-01T00:00:00Z');
";

        run_import(&pool, script).await.expect("import succeeds");

        // Not just "no error" — the row must actually be visible afterwards,
        // which is what proves `commit()` ran rather than being dead code a
        // mutation could delete unnoticed.
        assert_eq!(course_count(&pool).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 2")
            .fetch_one(&pool)
            .await
            .expect("the imported row is there");
        assert_eq!(name, "Latin");
    }

    #[tokio::test]
    async fn rolls_back_a_failing_script_entirely() {
        let pool = seeded_pool().await;

        let result = run_import(&pool, FAILING_SCRIPT).await;

        assert!(result.is_err(), "a script that fails partway must error");
        // The original row must still be there, untouched — not deleted, not
        // half-replaced. A script that got as far as the DELETEs before
        // failing on the duplicate INSERT would otherwise leave zero rows.
        assert_eq!(course_count(&pool).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 1")
            .fetch_one(&pool)
            .await
            .expect("the original row is untouched");
        assert_eq!(name, "Maths");
    }

    #[tokio::test]
    async fn a_write_after_a_failed_import_still_succeeds() {
        // The regression this whole command exists to fix: after a failed
        // import, the pool must not be left holding a write lock that blocks
        // every later write until the app restarts.
        let pool = seeded_pool().await;

        let _ = run_import(&pool, FAILING_SCRIPT).await;

        sqlx::query("UPDATE courses SET name = 'Maths 2' WHERE id = 1")
            .execute(&pool)
            .await
            .expect("an ordinary write on the same pool must still succeed");
    }
}
