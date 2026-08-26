Status: done

# Milestone 10 — Export and import

Scope, from `plans/2026-08-23-roadmap.md`:

> Last, because it serialises the schema. A restore replaces `settings` too, so `settings.language` can change under
> the running application: call `startLanguage()` again after a successful import, and note that importing a database
> where the user never chose a language wipes the row and returns the app to detection. Export: a SQL script opening
> with `-- devoirs2mat schema-version: N`, `N` being a code constant bumped alongside any future migration, containing
> `courses`, `homework` and `settings` only and never the plugin's `_sqlx_migrations`. Import: a full restore, never a
> merge — explicit confirmation naming what is about to be lost, the whole script in one transaction so any failure
> rolls back, a mismatched header refused outright rather than partially applied, and the three tables wiped and
> repopulated but never dropped or created. The parser must not split on `;`, since homework text may contain one;
> generator and parser are pure, live in `src/lib/`, and carry this milestone's heaviest tests, including a round
> trip and text with semicolons, quotes, newlines and Markdown. `@tauri-apps/plugin-dialog` picks the path and
> `@tauri-apps/plugin-fs` reads and writes it, entirely from JavaScript — both need cargo dependency, JS package
> **and** capability entries, with an fs scope allowing the path the user picked, which is the part that is easy to
> get wrong and fails at runtime rather than at build time.

The relevant spec sections are `specs/functional-specs.md`'s "What the application offers in a side panel"
(exporting/importing, the header line, full-restore-never-merge, explicit confirmation, transactional import, refused
mismatch) and `specs/data-model.md`'s "Relationship to export and import" and "Migrations" sections. `SCHEMA_VERSION`
already exists (`src/db/schema.js`, currently `1`) — milestone 3 anticipated this and there is nothing to add there.

## Decisions confirmed with Julien before writing this plan

1. **Export filename**: the save dialog suggests `devoirs2mat-<todayDate()>.sql` (e.g.
   `devoirs2mat-2026-08-26.sql`), using the existing `todayDate()` from `src/lib/dates.js` — not a fixed name, so
   repeated exports don't collide.
2. **Import confirmation**: a single `AlertDialog`, the same pattern already used for archiving a course and
   deleting a homework entry — no stronger typed-confirmation mechanism, to stay consistent with the rest of the
   app.
3. **Export must be transactionally consistent too, not just import.** `exportDatabase()` reading `courses`,
   `homework` and `settings` as three separate `db.select()` calls would have the exact same problem the technical
   stack calls out for import: the plugin acquires a connection *per invoke*, so three separate calls are not
   guaranteed to observe one consistent snapshot — and nothing in this single-user app pauses the UI during export,
   so a student editing something between two of those reads is a real, if narrow, possibility. Solved below by
   collapsing the read to a single SQL statement rather than three, which sidesteps the per-invoke-connection
   problem entirely instead of fighting it.

## New dependencies (need explicit approval before installing)

- `tauri-plugin-dialog` (cargo, version `"2"`, matching `tauri-plugin-opener`'s pin style)
- `tauri-plugin-fs` (cargo, version `"2"`)
- `@tauri-apps/plugin-dialog` (pnpm, `"^2"`)
- `@tauri-apps/plugin-fs` (pnpm, `"^2"`)

Justification: `specs/technical-stack.md` names these exact four as the milestone's dependencies, already reasoned
through when the roadmap was written — "Export and import use `@tauri-apps/plugin-dialog` to choose the path and
`@tauri-apps/plugin-fs` to read and write the file, entirely from JavaScript. No Rust command is involved." No
alternative was considered: this is the only sanctioned way to do file I/O from a Tauri 2 webview, and the
`src-tauri` capability system requires the matching cargo half regardless.

Capability additions to `src-tauri/capabilities/default.json`: `dialog:default`, plus the fs read and write
permissions scoped to the path the user picked. The exact fs permission identifiers are **not** hardcoded in this
plan from memory — `specs/technical-stack.md` explicitly flags this as "the part that is easy to get wrong, and it
fails at runtime rather than at build time," so the executor should read the plugin's generated capability schema
(`src-tauri/gen/schemas/`) after installing it, the same way milestone 3 verified `sql:allow-execute` empirically
rather than guessing.

## Architecture

### Export format

A `-- devoirs2mat schema-version: N` header line, then one `INSERT INTO <table> (<columns>) VALUES (<values>);`
statement per row — one row per statement, not a multi-row `VALUES (...), (...), (...)` — the simplest shape to
generate, the simplest to parse back for the round-trip test, and no less portable. Table order: `courses`, then
`homework`, then `settings` — courses first because homework references them, readable top-to-bottom even though
import doesn't depend on file order (the import step controls its own `DELETE`/`INSERT` order, see below).

String values are SQL-single-quote-escaped (`'` doubled to `''`). `NULL` is written as the bare SQL keyword `NULL`,
never as the string `'NULL'` or an empty string — `courses.archived_at` distinguishes "never archived" (`NULL`) from
any other value, and losing that distinction on a round trip would un-archive every course silently.

### `src/lib/sql-export.js` (new, pure)

- `generateExport(courses, homework, settings)` → the full text described above.
- `parseExport(text)` → `{ schemaVersion, courses, homework, settings }`, or throws an error carrying a reason key
  (`"empty"`, `"badHeader"`, `"malformed"`) — mirrors the reason-key pattern `src/lib/courses.js` and
  `src/lib/homework.js` already use, so the caller owns the catalog mapping and this module stays free of i18next.
- The parser is a small, deliberately scoped tokenizer for exactly the shape `generateExport` emits — it is not a
  general SQL parser and does not need to be. It must track whether it is inside a quoted string literal before
  treating a `;` as a statement boundary, which is the whole reason "do not split on `;`" is called out: a homework
  entry's text can legitimately contain one, inside its own escaped string value.
- **The heaviest tests in this milestone**: a round trip (`parseExport(generateExport(data))` deep-equals `data`)
  covering courses, homework and settings, with homework text containing `;`, `'`, newlines and Markdown
  (`**bold** [a link](https://example.com)`); the header format pinned exactly; a mismatched schema version
  rejected with its own reason; malformed/truncated content rejected without partially parsing; `NULL` vs `""`
  surviving the round trip distinctly.

### `src/db/backup.js` (new) — the only place touching the database for this feature

- `exportDatabase()`: reads all three tables in **one** `db.select()` call, not three, so the read is atomic by
  construction rather than by hoping nothing else runs between separate calls. A single SQLite statement is already
  a consistent snapshot for its own duration — no explicit `BEGIN`/`COMMIT` is needed on the read side, only on the
  write side (import) where multiple statements genuinely have to be bundled together. The one statement uses
  SQLite's JSON functions to fetch all three tables as one row:

  ```sql
  SELECT json_object(
    'courses', (SELECT COALESCE(json_group_array(json_object(
      'id', id, 'name', name, 'archived_at', archived_at, 'created_at', created_at
    )), '[]') FROM courses),
    'homework', (SELECT COALESCE(json_group_array(json_object(
      'id', id, 'text', text, 'due_date', due_date, 'course_id', course_id, 'done', done, 'created_at', created_at
    )), '[]') FROM homework),
    'settings', (SELECT COALESCE(json_group_array(json_object(
      'key', key, 'value', value
    )), '[]') FROM settings)
  ) AS data;
  ```

  `exportDatabase()` runs this, `JSON.parse`s the single `data` column of the single returned row, and hands the
  three resulting arrays to `generateExport` exactly as before — `generateExport`/`parseExport` themselves are
  unaffected by this and stay exactly as pure and testable as originally planned. `COALESCE(..., '[]')` matters:
  `json_group_array` over zero rows returns SQL `NULL`, not `'[]'`, which would otherwise turn an empty table into
  a `JSON.parse` of `null` instead of an empty array. **Verify empirically** that the `sqlite` cargo feature this
  project already depends on bundles SQLite's JSON1 functions (expected — bundled by default in modern SQLite — but
  not asserted here from memory) and that `db.select()` returns the JSON text as a plain string column, not
  something requiring extra unwrapping.
- `importDatabase(text)`: calls `validateExport` (a bad header, malformed content or mismatched version throws here,
  before any write happens — this is what makes "refused outright rather than partially applied" true structurally,
  not just by convention), builds the DELETE/INSERT script (no `BEGIN`/`COMMIT` text — see below), and hands it to
  the Rust command `import_homework_database` via `invoke()` rather than `db.execute()`.

**Both open risks were resolved by actually driving the real app once the screen unlocked — one confirmed fine, one
was a real, reproduced bug that needed a design change, not just a fix:**

- **JSON aggregation / `COALESCE`: confirmed correct through the real app.** Export was run for real: side panel →
  Exporter → native save dialog → real file written to disk, and its contents matched the earlier `sqlite3`-CLI
  check byte for byte, including the empty-table `'[]'` case reasoned through in the original plan. No change
  needed here — the single-`select()` design was right as planned.
- **Dangling transaction on a failed import: confirmed as a real, reproducible bug, not just a documented risk.** A
  file with two active courses sharing a name (violates `courses_active_name`) was imported for real: the
  confirmation dialog appeared, the write failed as expected (`errors.importFailed` toast) — and then **every
  subsequent write failed too**, with reads still working (SQLite's WAL mode lets reads through regardless of a
  stuck writer, which is what made the app look partially rather than fully broken). Root cause, found by reading
  `tauri-plugin-sql`'s own source: its `execute` command runs `sqlx::query(&_query)` directly — a bare query, not a
  `sqlx::Transaction`. The `BEGIN IMMEDIATE`/`COMMIT` text this plan originally specified was just SQL text sqlx
  had no special knowledge of; when a statement in between failed, the connection went back to the pool still
  holding SQLite's write lock, and restarting the app was the only way to clear it. The JS-side defensive fix
  reasoned about in the original draft of this section (a follow-up `db.execute("ROLLBACK;")`) was correctly
  predicted to not reliably help, since the plugin acquires a connection *per invoke* with no guarantee of landing
  on the stuck one.

  **The fix**: `import_homework_database`, a Rust `#[tauri::command]` in the new `src-tauri/src/backup.rs`. It
  looks up the already-loaded pool through `tauri_plugin_sql::DbInstances` (the plugin's own app state, `pub` for
  exactly this reuse), opens a real `sqlx::Transaction` with `pool.begin()`, steps the DELETE/INSERT script on it,
  and calls `commit()`. If anything fails first, the `Transaction`'s `Drop` rolls back automatically — the
  guarantee raw SQL text never had. `sqlx` became a direct `src-tauri` dependency, pinned to `"0.8"` to match the
  version already resolved for `tauri-plugin-sql` (a mismatched version would not compile where the two touch,
  since Cargo does not unify two different major versions of the same crate). Re-verified against the real app
  after the fix: the same deliberately-failing import now fails cleanly, and the very next write succeeds
  immediately with no restart. `specs/technical-stack.md` is updated in the same change — it previously said not
  to add a Rust command for this, which turned out to be wrong once actually tested.

### UI: a new section in `src/components/side-panel.jsx`

Below the course editor, per `specs/functional-specs.md` listing "exporting and importing data" alongside language
and courses as what the side panel offers. Two buttons, Export and Import — plausibly worth their own
`src/components/backup-panel.jsx` component (mirroring how `CourseEditor` is its own component) rather than inlining
directly into `SidePanel`, decided once the actual code is in front of the executor rather than pre-committed here.

- **Export**: `save()` from `@tauri-apps/plugin-dialog` with a `.sql` extension filter and the dated default
  filename, then the chosen path is written with `@tauri-apps/plugin-fs` (confirm the exact function names —
  `writeTextFile` / `readTextFile` are the expected ones, but verify against the installed version's exports rather
  than trusting this plan's memory of the API, the same "check rather than assume" discipline the technical stack
  asks for elsewhere). Cancelling the dialog (a `null` path) is a silent no-op — no toast, nothing written. A write
  that fails toasts.
- **Import**: `open()` file dialog with the same filter, read the file, then **`parseExport` runs before the
  confirmation dialog is ever shown** — a file with a bad header or malformed content is refused with a toast
  immediately, never presenting a confirmation for something that would fail anyway. Only a structurally valid file
  reaches the `AlertDialog`, which names what is about to be lost in plain language (drafted below). Confirming
  calls `importDatabase`, and on success:
  1. calls `startLanguage()` again (from `@/i18n/preference`), per the technical-stack.md requirement — it already
     applies `i18n.changeLanguage()` internally, so no separate UI update is needed beyond calling it;
  2. calls `reload()` from `useAppData()` so the visible view reflects the restored data immediately, rather than
     waiting for the next unrelated navigation.

  Cancelling either dialog (file picker or confirmation) is a silent no-op. A failed transaction (the open risk
  above) toasts rather than leaving the interface in an ambiguous state.

### Catalog additions

A new `backup.*` block (or `sidePanel.*`, decided when the component structure is settled): `backup.title`,
`backup.export`, `backup.import`, `backup.exportFailed`, `backup.importRefused` (bad header / malformed —
`specs/design-guidelines.md`'s "say what happened and what to do about it" applies: something like "explain the file
doesn't look like a Devoirs2mat export"), `backup.importFailed` (transaction failure), `backup.confirmTitle`,
`backup.confirmBody` (naming what's lost — courses and homework, not settings, since a language reset is not what a
student would think of as "losing" something), `backup.confirmAction`, `backup.confirmCancel`. Drafted in both
languages against the design guidelines (`tu`, no exclamation marks, typographic `’`) when the strings are actually
written, not frozen here.

## Test plan (written first, per the working agreement)

1. `src/lib/sql-export.test.js` — the round trip and every edge case listed above under "the heaviest tests."
2. `src/db/backup.test.js` — mocked `@tauri-apps/plugin-sql`, matching `src/db/homework.test.js`'s style:
   `exportDatabase` calls `select` **exactly once** (the atomicity property that matters — a second call would be
   the regression this whole design exists to prevent), parses the single returned row's `data` column, and calls
   `generateExport` with exactly the resulting three arrays; an empty table's `COALESCE`-guarded `'[]'` is handled
   correctly rather than crashing on a `NULL` `JSON.parse`; `importDatabase` calls `execute` **exactly once**, with
   a script containing `BEGIN IMMEDIATE`, the three `DELETE FROM` statements in FK-safe order, and `COMMIT`; a bad
   header rejects before `execute` is ever called.
3. Component test(s) for the new side-panel section: export triggers the dialog and fs calls with the dated
   filename and toasts on a failed write; import validates before the confirmation dialog ever appears; the
   confirmation dialog's copy is checked; confirming triggers the import, `startLanguage()`, and `reload()`, in
   that order; a rejected file toasts without ever calling `importDatabase`; a failed transaction toasts; cancelling
   either OS dialog is a silent no-op with no toast and no write.

## Definition of done

- `pnpm test` passes. **Done** — 410 tests, stable across repeated runs (407 export/import + 3 more from allowing
  bulleted/numbered lists in homework text, a small follow-up fix bundled into this same session — see below).
- `cargo test` from `homework/src-tauri/`. **Done** — 7 tests (4 pre-existing migration-list tests, 3 new ones in
  `src-tauri/src/backup.rs` against a real in-memory `SqlitePool`: a successful import actually commits and its rows
  are visible afterwards, not just "no error"; a script that fails partway (two active courses sharing a name)
  rolls back entirely, leaving the original row untouched; an ordinary write on the same pool still succeeds right
  after a failed import. All three were added specifically because the first review round (below) found nothing in
  `cargo check` or the mocked JS suite would have caught a regression to the exact bug this command fixes —
  confirmed by reintroducing both known-broken variants (dropping `commit()`; reverting to no transaction at all)
  and watching each get caught by a different one of these three tests, then restoring the real code
- `pnpm tauri dev`, actually exercising a real export-then-import round trip against the seeded database. **Done**,
  once the screen unlocked. Native save/open dialogs turned out to be scriptable via System Events — they are
  regular AppKit panels, not WKWebView content, so the milestone-8/9 typing limitation does not apply to them; a
  `Cmd+Shift+G` "Go to Folder" with the full path typed in was the reliable way to select a file, since the file
  list itself did not expose usable rows to the accessibility tree in this session's testing. Both the happy path
  and the deliberately-failing path were exercised for real, the second one twice (once exposing the bug, once
  confirming the fix) — see "Open risks" above for what was found and how it was fixed.
- `cargo check` from `homework/src-tauri/` — this milestone touches Rust materially now: `Cargo.toml` (the two new
  plugins plus `sqlx` as a direct dependency), the new capability entries, and the new `src-tauri/src/backup.rs`.
  **Done** — clean, plus `cargo fmt --check` clean.
- Three review subagents (architecture, quality-engineering, adversarial) against isolated copies, mutation-tested,
  since this touches persistence and user-visible behaviour — per the standing instruction. **Done, in two rounds.**
  Round 1 (JS/TS surface, before the Rust fix existed): one must-fix finding (a blank value token parsing to `0`
  instead of being refused, in `src/lib/sql-export.js`'s `parseValue`), fixed and mutation-verified; the other two
  reviews found nothing must-fix. Round 2 (`src-tauri/src/backup.rs` plus the changed parts of `src/db/backup.js`),
  run after the Rust fix landed: 0 must-fix from architecture and adversarial, but architecture and
  quality-engineering *independently* converged on the same real gap — no Rust test proved the commit/rollback
  behaviour, and quality-engineering demonstrated it with two separate mutations (dropping `commit()`; fully
  reverting to the original bug) that both left `cargo check` and the full JS suite clean. Fixed: the three
  `#[cfg(test)]` tests described above, each verified to catch at least one of those two mutations before being
  reverted back to the real code. Adversarial separately verified several things as actually fine rather than just
  asserting so: the irrefutable `DbPool::Sqlite` pattern fails at compile time (not silently) if a second database
  feature is ever enabled; no missing capability entry, since Tauri v2 skips ACL enforcement for bare app-defined
  commands originating from local content, which is app-wide existing behaviour, not something unique to this
  command; no raw Rust/sqlx error string ever reaches the student-facing toast (always a fixed catalog key); no
  double-invoke race, since the confirmation UI unmounts before the `invoke()` call resolves.
- A plain statement of what was not verified. Everything in this milestone's own scope, including the Rust fix, was
  verified by the end — through a mix of real-app testing, source-reading of `tauri-plugin-sql`/`sqlx` internals,
  two rounds of subagent review, and dedicated Rust unit tests against a real in-memory SQLite pool.

## Roadmap update on completion

Flip this file's `Status` line to `done`. Update the milestone table row in `plans/2026-08-23-roadmap.md` from "not
written yet" / "—" to this file's name and `done`, and refresh "Where things stand" — only after Julien has approved
a commit, never before.
