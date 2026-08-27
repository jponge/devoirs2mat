Status: done

# Import safety net: pre-restore snapshot + accurate failure reporting

## Context

A three-subagent data-loss review (architecture / quality-engineering / adversarial lenses) of the
import-restore flow found two related HIGH-severity issues, both in the same code path
(`homework/src-tauri/src/backup.rs` and `homework/src/components/backup-panel.jsx`):

1. **No pre-restore snapshot.** `import_homework_database` (`backup.rs`) correctly runs the restore
   inside a `sqlx::Transaction`, so a *failing* import rolls back cleanly (already covered by three
   Rust tests). But a *structurally valid* import of the wrong file — a stale backup, a sibling's
   export, an empty one (`validateExport` only checks the header and schema version, per
   `homework/src/lib/sql-export.js:214-220`) — succeeds completely and irreversibly overwrites
   current data. There is no way back.
2. **False failure message on partial post-import errors.** `confirmImport`
   (`homework/src/components/backup-panel.jsx:83-97`) wraps `importDatabase()` (the actual,
   committed restore), `startLanguage()` and `reload()` in one `try`. If `importDatabase` succeeds
   but `startLanguage()` or `reload()` throws afterward, the single `catch` reports
   `"importFailed"`, whose copy is *"Couldn't restore your data. Nothing was changed."*
   (`homework/src/i18n/en.json:92`) — false, since the transaction already committed
   (`backup.rs:25-30`). A user could distrust the restore or re-import unnecessarily.

This plan fixes both. Scope decisions already made with the project owner (do not re-litigate):

- The snapshot is a **silent safety net only** — a rolling file on disk, no new UI, no "restore my
  backup" button. Recovery from a bad restore is: locate the snapshot file, re-import it manually
  through the existing import flow.
- The post-commit failure gets a **new, distinct, accurate toast** — not folded into `importFailed`
  and not silently swallowed.

This is a single-user desktop app: no concurrency/multi-instance handling is needed anywhere in this
plan.

## Part 1 — Rust: pre-restore snapshot (`homework/src-tauri/src/backup.rs`)

### Mechanism

Before the import transaction runs, write a complete, consistent copy of the *current* database to a
fixed, rolling snapshot file using SQLite's `VACUUM INTO`. This is simpler and more robust than
re-implementing the SQL-export dump in Rust: `VACUUM INTO` produces a single-statement, consistent
snapshot regardless of WAL state, without needing an explicit transaction (in fact SQLite does **not**
allow `VACUUM INTO` inside an explicit transaction — it must run directly on the pool, before
`pool.begin()`).

Snapshot path: same directory as `homework.db` (the app data dir), filename `last-known-good.db`.
This is a raw SQLite file, not the `.sql` export text format — it is purely internal, never surfaced,
never read by any other code path. One rolling file, overwritten on every import attempt.

Crash safety for the snapshot write itself: `VACUUM INTO` refuses to write to a path that already
exists, so target a temp path (`last-known-good.db.tmp`), remove any stale leftover first, then
`std::fs::rename` it into place. Rename within the same directory is atomic, so a crash mid-vacuum
never corrupts the *previous* good snapshot — the rename either happens or it doesn't.

**Platform gotcha:** `std::fs::rename` overwrites the destination atomically on POSIX (macOS, Linux)
but *fails* with "already exists" on Windows if `snapshot_path` is already occupied by the previous
snapshot — and this app ships Windows builds (`specs/technical-stack.md`). Every import after the
first would therefore error on Windows. Remove the previous snapshot file first (same
ignore-if-absent pattern as the tmp cleanup), immediately before the rename, on all platforms.

If the snapshot step fails for any reason, **abort the import entirely** — do not proceed to the
transaction. A restore is only allowed to run once its own escape hatch is confirmed written.

### Code changes

`run_import`'s signature grows a `snapshot_path: &Path` parameter, kept in the same
Tauri-independent, directly-testable shape the module's doc comment already commits to:

```rust
async fn run_import(pool: &SqlitePool, script: &str, snapshot_path: &Path) -> Result<(), ImportError> {
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
    sqlx::query(script).execute(&mut *tx).await.map_err(ImportError::Db)?;
    tx.commit().await.map_err(ImportError::Db)?;
    Ok(())
}
```

Add a small local error enum — **do not** add `thiserror` or any other crate; this needs no new
dependency, hand-write `Display`:

```rust
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
            ImportError::SnapshotRename(e) => write!(f, "could not finalize pre-restore snapshot: {e}"),
            ImportError::Db(e) => write!(f, "{e}"),
        }
    }
}
```

The `#[tauri::command]` wrapper (`import_homework_database`) needs the app data dir, which it doesn't
currently have access to. Add an `app: tauri::AppHandle` parameter (Tauri injects it automatically —
no call-site change needed on the JS side) and resolve the snapshot path with
`app.path().app_data_dir()` (via the `tauri::Manager` trait), joined with `"last-known-good.db"`. This
mirrors how `"sqlite:homework.db"` already resolves relative to the app data dir per the comment in
`homework/src-tauri/src/lib.rs:10-13`. Map the final error the same way as today:
`.map_err(|error| error.to_string())`.

**Verified during implementation:** `sqlx::query("VACUUM INTO ?").bind(path)` works fine against the
pinned `sqlx` 0.8 / SQLite version when the source pool is a real file-backed database — the
bind-parameter form shipped as written, no fallback needed. What *doesn't* work is unrelated to bind:
`VACUUM INTO` against a `sqlite::memory:` source pool silently produces no output file at all (the
`execute()` call returns `Ok`, but nothing is written to disk) — a pool-per-connection quirk of sqlx's
in-memory handling, confirmed empirically with a standalone repro against both bind and inline-string
forms, and cross-checked against `rusqlite` to rule out a general SQLite behavior. Production code
never hits this, since the app's database is always file-backed — but it means the Rust test fixture
(`seeded_pool()`) had to move from `sqlite::memory:` to a real temp-file database, as this plan's
"Rust tests to add" section already allowed for.

### Rust tests to add (same file, same style as the existing three)

Use a real temp-file SQLite database for the source pool in the new tests (not `sqlite::memory:`) if
`VACUUM INTO` behaves differently against an in-memory source — check this empirically first; if
`VACUUM INTO` works fine against `sqlite::memory:`, keep using `seeded_pool()` as-is. Use
`std::env::temp_dir()` with a unique per-test filename for the snapshot destination; clean up the
temp files at the end of each test.

**Existing tests need updating too.** `run_import` gains a third parameter (`snapshot_path: &Path`),
so the three tests already in this file — `commits_a_successful_script`,
`rolls_back_a_failing_script_entirely`, `a_write_after_a_failed_import_still_succeeds` — no longer
compile as written. Update each call site to pass a scratch snapshot path (a unique temp-dir file per
test is fine, same as the new tests; these three don't need to assert anything about the snapshot's
contents, just supply a writable path). This is a mechanical signature fix, not a behavior change —
do it as part of the same edit that changes the signature, not as an afterthought.

1. `snapshots_current_data_before_a_successful_import` — seed pool, run `run_import` with a script
   that replaces the data, then open the snapshot file as its own fresh `SqlitePool` and assert it
   contains the *pre-import* row (`Maths`, id 1), not the post-import one.
2. `snapshots_current_data_even_when_the_import_script_fails` — use `FAILING_SCRIPT`, assert
   `run_import` still errs (existing rollback guarantee preserved) **and** the snapshot file was
   still written with the pre-import data. This is the whole point: the snapshot must not be
   contingent on the import itself succeeding, because a snapshot only skipped on failure would
   still miss the actually dangerous case (a wrong-but-valid file that succeeds).
3. `a_second_import_overwrites_the_previous_snapshot` — run two successful imports in sequence
   against the same snapshot path, assert the final snapshot reflects the state immediately before
   the *second* import, not the first (proves "rolling single file," not an accumulating history).
4. `aborts_the_import_when_the_snapshot_cannot_be_written` — point `snapshot_path` at a directory
   that doesn't exist (or is otherwise unwritable), assert `run_import` errors *and* the source
   database is completely untouched (`course_count` unchanged) — proves the transaction never started.

## Part 2 — JS: accurate post-commit failure reporting (`homework/src/components/backup-panel.jsx`)

### Code change

Split `confirmImport` so only a failure of `importDatabase` itself is reported as `"importFailed"`.
A failure of `startLanguage()` or `reload()` *after* a successful import is a different, new failure
kind:

```js
const confirmImport = async () => {
  const text = pendingImport;
  setPendingImport(null);
  try {
    await importDatabase(text);
  } catch (failure) {
    onError(failure, "importFailed");
    return;
  }
  try {
    // A restore replaces `settings` too, so `settings.language` can change
    // under the running application — re-resolve it exactly the way
    // startup does, rather than leaving the interface in a language the
    // restored database no longer says the student chose.
    await startLanguage();
    await reload();
  } catch (failure) {
    onError(failure, "importSucceededRefreshFailed");
  }
};
```

### i18n

Add a new catalog key alongside the existing three `backup.*` failure keys
(`homework/src/i18n/en.json:90-92`, `homework/src/i18n/fr.json:90-92`), matching their existing
tone (short, second person, tells the student what to do):

- `en.json`: `"importSucceededRefreshFailed": "Your data was restored, but the app couldn't fully refresh. Try restarting the app."`
- `fr.json`: `"importSucceededRefreshFailed": "Tes données ont été restaurées, mais l'application n'a pas pu se rafraîchir complètement. Essaie de relancer l'application."`

Match whatever apostrophe/quote convention the surrounding keys already use in each file (the existing
entries use curly quotes `’` — follow that, don't introduce straight quotes). Also: the catalogs never
name the app ("Devoirs") in copy — `catalogs.test.js`'s "do not translate the application name" test
enforces this — say "the app" / "l'application" instead, matching `errors.startupFailed` right below
this key.

Confirm how `onError`'s `kind` argument is consumed upstream (check `App.jsx` or wherever
`BackupPanel`'s `onError` prop is wired) — the comment at `backup-panel.jsx:32-35` says `kind` is
"the exact suffix of its own `backup.*` catalog key," so no lookup table should need updating beyond
the two i18n files, but verify this by reading the actual consumer before assuming.

### Tests to add/update (`homework/src/components/backup-panel.test.jsx`)

1. New test: `importDatabase` resolves, `startLanguage` rejects → `onError` is called with
   `"importSucceededRefreshFailed"`, **not** `"importFailed"`, and `importDatabase` is called exactly
   once (proves no retry/re-import happens).
2. Same shape with `reload` rejecting instead of `startLanguage`.
3. Confirm the existing `importFailed` test (if one exists covering `importDatabase` itself
   rejecting) still passes unchanged — that path's behavior doesn't change.

## Part 3 — Spec updates (same change, per project convention: code and specs must not diverge)

1. **`specs/functional-specs.md`**, under "exporting and importing data" (around line 141-149): add a
   bullet stating that a restore automatically writes a pre-restore snapshot first, that this is a
   silent internal safety net with no dedicated UI, and that recovery from an unwanted restore means
   manually re-importing that snapshot file. Also note, under "Errors and feedback" (around line
   151-159), that an import which commits but then fails to fully refresh the running app reports a
   distinct message from an import that never touched the data, and that a restart resolves it.

2. **`specs/data-model.md`**, under "Relationship to export and import" (around line 178-189): add a
   bullet documenting the snapshot file's existence, its location (same app data directory as
   `homework.db`), its filename (`last-known-good.db`), and that it is a raw SQLite file produced by
   `VACUUM INTO` — **not** the `.sql` export format — and is never read, written, or touched by any
   code path other than the import command itself.

3. **`specs/technical-stack.md`**, right after the existing `import_homework_database` explanation
   (around line 55-73): document the `VACUUM INTO` mechanism, why it must run outside the explicit
   transaction (SQLite disallows `VACUUM INTO` inside one), the tmp-file-then-rename pattern for
   snapshot-write atomicity, and the new `AppHandle` parameter needed to resolve the app data
   directory in the command wrapper (matching how `lib.rs` already resolves `sqlite:homework.db`
   relative to it).

## Definition of done

- `cargo test` (from `homework/src-tauri/`) passes, including the four new tests in Part 1.
- `cargo check` passes.
- `pnpm test` (from `homework/`) passes, including the new/updated tests in Part 2.
- `pnpm tauri dev` started, and the import flow manually exercised end to end: export current data,
  make a change, import an older export, confirm `last-known-good.db` appears in the app data
  directory and contains the pre-import state (open it with any SQLite browser/CLI to check). If
  feasible, manually force a post-commit failure (e.g. temporarily throw inside `reload`) to see the
  new toast copy render correctly in both languages.
- The three spec files updated as described in Part 3, in the same change.
- State plainly anything not verified — e.g. if the `VACUUM INTO` bind-parameter question from Part 1
  couldn't be fully confirmed against the exact pinned `sqlx`/SQLite version, say so.

## Out of scope (explicitly, per the scope decisions above)

- No "restore last automatic backup" UI/button.
- No retention of more than one snapshot (no history, no timestamps in the filename).
- No changes to the `exportFailed` / `importRefused` flows — only `importFailed`'s scope narrows and
  the new `importSucceededRefreshFailed` kind is added.
- The durability-PRAGMA question (`journal_mode`/`synchronous` defaults) raised in the same review is
  a separate, unconfirmed finding — not part of this plan. Do not fold it in.
