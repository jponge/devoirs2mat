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
use std::path::Path;

use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug)]
enum ImportError {
    Snapshot(sqlx::Error),
    SnapshotRename(std::io::Error),
    Db(sqlx::Error),
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImportError::Snapshot(e) => write!(f, "could not write pre-restore snapshot: {e}"),
            ImportError::SnapshotRename(e) => {
                write!(f, "could not finalize pre-restore snapshot: {e}")
            }
            ImportError::Db(e) => write!(f, "{e}"),
        }
    }
}

// The transactional core, kept independent of Tauri's command/state plumbing
// so it can be tested directly against a plain pool — no app context needed.
// This is deliberately the one thing under test: `cargo check` alone cannot
// tell a script that commits from one that silently rolls back, since both
// type-check identically.
//
// Before the transaction runs, a full, consistent copy of the *current*
// database is written to `snapshot_path` via `VACUUM INTO`. A structurally
// valid import of the wrong file (a stale backup, a sibling's export) would
// otherwise succeed completely and irreversibly overwrite current data with
// no way back — the snapshot is the escape hatch. `VACUUM INTO` must run
// directly on the pool, before `pool.begin()`: SQLite does not allow it
// inside an explicit transaction. If the snapshot can't be written, the
// import is aborted entirely — a restore is only allowed to run once its own
// escape hatch is confirmed written.
async fn run_import(
    pool: &SqlitePool,
    script: &str,
    snapshot_path: &Path,
) -> Result<(), ImportError> {
    let tmp_path = snapshot_path.with_extension("db.tmp");
    let _ = std::fs::remove_file(&tmp_path); // stale leftover from a prior crash, fine if absent

    sqlx::query("VACUUM INTO ?")
        .bind(tmp_path.to_str().expect("snapshot path is valid UTF-8"))
        .execute(pool)
        .await
        .map_err(ImportError::Snapshot)?;
    let _ = std::fs::remove_file(snapshot_path); // previous snapshot, fine if absent; Windows rename fails over an existing file
    std::fs::rename(&tmp_path, snapshot_path).map_err(ImportError::SnapshotRename)?;

    let mut tx = pool.begin().await.map_err(ImportError::Db)?;
    sqlx::query(script)
        .execute(&mut *tx)
        .await
        .map_err(ImportError::Db)?;
    tx.commit().await.map_err(ImportError::Db)?;
    Ok(())
}

#[tauri::command]
pub async fn import_homework_database(
    app: AppHandle,
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

    let snapshot_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("last-known-good.db");

    run_import(pool, &script, &snapshot_path)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

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

    // A unique path per call so parallel `cargo test` runs never collide;
    // nothing pre-exists at it, matching a fresh app data directory.
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    fn temp_db_path(purpose: &str) -> PathBuf {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "devoirs-backup-test-{purpose}-{}-{id}.db",
            std::process::id()
        ))
    }
    fn temp_snapshot_path() -> PathBuf {
        temp_db_path("snapshot")
    }

    fn cleanup(path: &Path) {
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(path.with_extension("db.tmp"));
    }

    // A real temp-file database, not `sqlite::memory:`: `VACUUM INTO` against
    // an in-memory sqlx source silently produces no output file at all (a
    // pool-per-connection quirk — confirmed empirically against the pinned
    // sqlx/SQLite version; the bind-parameter form of `VACUUM INTO ?` itself
    // works fine, this is unrelated). Production code never hits this, since
    // the app's database is always file-backed, but the test fixture must
    // match that or every snapshot assertion here would be testing nothing.
    async fn seeded_pool() -> (SqlitePool, PathBuf) {
        let path = temp_db_path("src");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&format!("sqlite:{}?mode=rwc", path.display()))
            .await
            .expect("temp-file pool opens");
        sqlx::query(SCHEMA)
            .execute(&pool)
            .await
            .expect("schema applies");
        sqlx::query(SEED_COURSE)
            .execute(&pool)
            .await
            .expect("seed row inserts");
        (pool, path)
    }

    async fn course_count(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM courses")
            .fetch_one(pool)
            .await
            .expect("count query succeeds")
    }

    async fn open_snapshot(path: &Path) -> SqlitePool {
        SqlitePoolOptions::new()
            .connect(&format!("sqlite:{}", path.display()))
            .await
            .expect("snapshot file opens as its own pool")
    }

    #[tokio::test]
    async fn commits_a_successful_script() {
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();
        let script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Latin', NULL, '2026-01-01T00:00:00Z');
";

        run_import(&pool, script, &snapshot_path)
            .await
            .expect("import succeeds");

        // Not just "no error" — the row must actually be visible afterwards,
        // which is what proves `commit()` ran rather than being dead code a
        // mutation could delete unnoticed.
        assert_eq!(course_count(&pool).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 2")
            .fetch_one(&pool)
            .await
            .expect("the imported row is there");
        assert_eq!(name, "Latin");

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn rolls_back_a_failing_script_entirely() {
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();

        let result = run_import(&pool, FAILING_SCRIPT, &snapshot_path).await;

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

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn a_write_after_a_failed_import_still_succeeds() {
        // The regression this whole command exists to fix: after a failed
        // import, the pool must not be left holding a write lock that blocks
        // every later write until the app restarts.
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();

        let _ = run_import(&pool, FAILING_SCRIPT, &snapshot_path).await;

        sqlx::query("UPDATE courses SET name = 'Maths 2' WHERE id = 1")
            .execute(&pool)
            .await
            .expect("an ordinary write on the same pool must still succeed");

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn snapshots_current_data_before_a_successful_import() {
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();
        let script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Latin', NULL, '2026-01-01T00:00:00Z');
";

        run_import(&pool, script, &snapshot_path)
            .await
            .expect("import succeeds");

        let snapshot = open_snapshot(&snapshot_path).await;
        assert_eq!(course_count(&snapshot).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 1")
            .fetch_one(&snapshot)
            .await
            .expect("the pre-import row is in the snapshot");
        assert_eq!(name, "Maths");
        snapshot.close().await;

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn snapshots_current_data_even_when_the_import_script_fails() {
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();

        let result = run_import(&pool, FAILING_SCRIPT, &snapshot_path).await;

        assert!(result.is_err(), "the import script itself still fails");
        // The whole point: the snapshot must not be contingent on the import
        // succeeding, because a snapshot only taken on success would still
        // miss the actually dangerous case — a wrong-but-valid file that
        // succeeds and overwrites current data with no way back.
        let snapshot = open_snapshot(&snapshot_path).await;
        assert_eq!(course_count(&snapshot).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 1")
            .fetch_one(&snapshot)
            .await
            .expect("the pre-import row is in the snapshot despite the failure");
        assert_eq!(name, "Maths");
        snapshot.close().await;

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn a_second_import_overwrites_the_previous_snapshot() {
        let (pool, src_path) = seeded_pool().await;
        let snapshot_path = temp_snapshot_path();
        let first_script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Latin', NULL, '2026-01-01T00:00:00Z');
";
        let second_script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (3, 'Physics', NULL, '2026-01-01T00:00:00Z');
";

        run_import(&pool, first_script, &snapshot_path)
            .await
            .expect("first import succeeds");
        run_import(&pool, second_script, &snapshot_path)
            .await
            .expect("second import succeeds");

        // The snapshot must reflect the state right before the *second*
        // import (i.e. after the first) — a rolling single file, not an
        // accumulating history.
        let snapshot = open_snapshot(&snapshot_path).await;
        assert_eq!(course_count(&snapshot).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 2")
            .fetch_one(&snapshot)
            .await
            .expect("the state right before the second import is in the snapshot");
        assert_eq!(name, "Latin");
        snapshot.close().await;

        cleanup(&snapshot_path);
        cleanup(&src_path);
    }

    #[tokio::test]
    async fn aborts_the_import_when_the_snapshot_cannot_be_written() {
        let (pool, src_path) = seeded_pool().await;
        // A directory that doesn't exist: `VACUUM INTO` can't create it.
        let snapshot_path = std::env::temp_dir()
            .join("devoirs-backup-test-nonexistent-dir")
            .join("last-known-good.db");
        // Deliberately a script that would otherwise succeed (unlike
        // `FAILING_SCRIPT`, which fails on its own merits regardless of the
        // snapshot). If the transaction ran despite the snapshot failing, this
        // script commits and the row changes — `FAILING_SCRIPT` here would
        // roll back either way and couldn't tell the two cases apart.
        let script = "DELETE FROM homework;
DELETE FROM courses;
DELETE FROM settings;
INSERT INTO courses (id, name, archived_at, created_at) VALUES (2, 'Latin', NULL, '2026-01-01T00:00:00Z');
";

        let result = run_import(&pool, script, &snapshot_path).await;

        assert!(
            result.is_err(),
            "an unwritable snapshot path aborts the import"
        );
        // The transaction must never have started: the original row is still
        // there, untouched, not replaced by the script that would otherwise
        // have succeeded.
        assert_eq!(course_count(&pool).await, 1);
        let name: String = sqlx::query_scalar("SELECT name FROM courses WHERE id = 1")
            .fetch_one(&pool)
            .await
            .expect("the original row is untouched");
        assert_eq!(name, "Maths");

        cleanup(&src_path);
    }
}
