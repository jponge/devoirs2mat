Status: done

# Milestone 3 — Persistence

Part of [the roadmap](2026-08-23-roadmap.md). Depends on milestones 1 and 2. Milestone 4 stores the language
preference in `settings`, so this comes first, and everything from milestone 7 onwards reads through it.

## Context

The database does not exist yet. `specs/data-model.md` specifies its intended shape in full — three tables, their
constraints, the two kinds of time, the ordering rules and the invariants — and `specs/technical-stack.md` fixes how
it is reached: the Tauri SQL plugin, migrations owned by Rust, queries from JavaScript.

This milestone builds exactly that and nothing on top of it. There is no user interface for data until milestone 7,
so the deliverable is a schema, a thin data layer, and honest evidence that both work against the real database.

## Where the SQL lives — the boundary

This is not negotiable and is easy to drift on, so it is stated before the steps:

- **Rust owns the schema and nothing else.** `src-tauri/src/migrations.rs` holds the DDL — `CREATE TABLE`,
  `CREATE INDEX`, and any future `ALTER` — because the plugin requires migrations to be declared there. That is the
  one deliberate exception to "the code is written in JavaScript", and it is fine
- **Every query and every mutation is JavaScript**, in `src/db/`, through `@tauri-apps/plugin-sql`. All `SELECT`,
  `INSERT`, `UPDATE` and `DELETE` live there. Do not add a `#[tauri::command]` for data access, do not put a query
  string in Rust, and do not "just for now" push a lookup into Rust because it is convenient
- The temporary round-trip in the verification section is therefore **JavaScript too**, not a Rust probe

The single most likely way to get this wrong is silently: `specs/technical-stack.md` warns that a missing cargo
feature or a missing capability entry fails **at runtime with an opaque permission error**, not at build time. So
this plan treats "it compiles" as worth nothing and insists on a round trip against a real file on disk.

## Dependencies requiring approval

| package | why | alternative rejected |
|---|---|---|
| `tauri-plugin-sql` (cargo, **`features = ["sqlite"]`**) | named by the technical stack; owns the connection pool and runs the migrations | a hand-rolled `rusqlite` command layer — more Rust, and the spec says queries go through the plugin's JS API |
| `@tauri-apps/plugin-sql` (pnpm) | the JavaScript half of the same plugin; without it there is no way to query | none — it is the counterpart of the crate above |

Two packages, one on each side of the boundary. The `sqlite` feature is not optional: without it the crate compiles
and every query fails at runtime.

## Steps

### 1. Install and wire the plugin

- `src-tauri/Cargo.toml` — `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`
- `package.json` — `@tauri-apps/plugin-sql`
- `src-tauri/capabilities/default.json` — add `"sql:default"` to `permissions`. **Missing this is the opaque-error
  trap**; it is invisible until a query runs
- `src-tauri/src/lib.rs` — register the plugin with the migrations attached to `sqlite:homework.db`

### 2. `src-tauri/src/migrations.rs`

One migration, version 1, translating `specs/data-model.md` exactly: `courses`, `homework`, `settings`, the
`courses_active_name` partial unique index, and the `homework_due_date` / `homework_course_id` indices. Copy the
constraints faithfully — the `CHECK (length(trim(name)) > 0)` on `courses.name`, `CHECK (due_date GLOB '____-__-__')`
and `CHECK (done IN (0, 1))` on `homework`, `ON DELETE RESTRICT` on the foreign key.

`homework.text` is `NOT NULL` **and may be the empty string**. That is deliberate and specified; no constraint may
reject empty text.

From here migrations are append-only: never edit one that has shipped.

### 3. Check the `PRAGMA foreign_keys` claim in the spec

`specs/data-model.md` says foreign keys are off by default in SQLite and must be enabled per connection. That is true
of SQLite in general; it is probably **not** true of this stack, because sqlx — which the plugin uses — turns them on
for every connection it opens. So the likely outcome is that there is nothing to do.

Check it rather than assuming, and check it the way that matters: insert a `homework` row with a `course_id` that
does not exist and assert the insert is **rejected**. Reading the pragma back proves less than the behaviour does.

Then make the spec match reality — either delete that section as inapplicable here, or keep it with the evidence.
Do not add code to fix a problem that turns out not to exist.

### 4. `src/db/`

A thin layer, kept thin because it cannot be tested outside the Tauri runtime:

- one shared `Database.load("sqlite:homework.db")`, opened once and reused — a module-level promise, not a
  connection opened per call
- the queries and mutations later milestones need: courses (list, create, rename, archive), homework (list by date
  range, create, update, toggle done, delete), settings (get, set)
- `ORDER BY created_at, id` inside a group, and **never** `ORDER BY` on a name — course sorting is `localeCompare` in
  JavaScript, per the spec, and belongs to milestone 5's helpers, not here
- no business logic: this module translates function calls to SQL and back, nothing more
- this is where **all** the SQL for the application lives, now and in every later milestone

### 5. The schema version constant

`specs/data-model.md` says the export header carries a constant bumped in the same change that adds a migration.
Migration 1 lands here, so the constant is introduced here with value `1`, in one place, ready for milestone 10.
Do **not** mirror the plugin's `_sqlx_migrations` bookkeeping table — the spec forbids reading, writing, exporting or
wiping it.

### 6. Tests

- **Rust**, `#[cfg(test)]` in `migrations.rs`: the list is ordered, versions are contiguous from 1, descriptions are
  unique and non-empty, and every entry is `MigrationKind::Up`. This is a guard against a future append going wrong,
  which is the realistic failure
- **JavaScript**: `src/db/` is faked, not exercised. Milestone 2's review flagged this as the milestone where module
  mocks arrive, and the config now sets `restoreMocks` for it. Establish the pattern here — `vi.mock` over
  `@tauri-apps/plugin-sql` — so milestones 7-9 inherit a convention rather than inventing three
- Do **not** try to run the SQL plugin inside vitest. It only exists in the Tauri runtime, and the spec says so

## Verification

Compiling proves nothing here. In order:

1. `cargo check` and `cargo test` from `homework/src-tauri/`
2. `pnpm test` — passes and exits
3. `./scripts/dev-probe.sh` — the app starts with migrations applied and no panic in the log
4. **A real round trip against the real database.** A temporary, clearly-marked startup call that inserts a course,
   reads it back, and logs the result, observed through the probe's log. Then confirm the database file actually
   exists on disk under the application data directory for `org.ponge.homework`
5. **The foreign-key behaviour from step 3**, proven by a rejected insert
6. **Delete the temporary code from step 4 before the milestone closes**, and re-run 1-3. Leaving debug scaffolding
   in is how it ships

## Not in this milestone

- any user interface — no component reads or writes anything yet
- the language preference logic (milestone 4); this only provides the `settings` table and its accessors
- export and import (milestone 10), beyond introducing the version constant
- any second migration. If the data model turns out to be wrong, fix migration 1 *now*, before it has shipped —
  after this milestone lands it is frozen and only an append can change it

## Definition of done

- `cargo check`, `cargo test` and `pnpm test` all pass
- the application starts, the migrations apply, and the database file exists on disk
- a real insert-and-read-back round trip has been observed, and the temporary code that did it has been removed
- the foreign-key question is settled with evidence, and `specs/data-model.md` reflects what was actually found
- what was not verified is stated plainly

---

## Outcome (recorded 2026-08-24)

Executed by a subagent, then reviewed by three subagents. The suite went from 54 to 73 tests, and the schema is now
covered by a real SQLite engine.

### Two real bugs found by running it, not by reading it

- **The data model's `due_date` CHECK rejected every real date.** `GLOB '____-__-__'` — `_` is a `LIKE` wildcard and
  a *literal underscore* in `GLOB`, so the constraint matched only the ten-character string `____-__-__`. Verified:
  `SELECT '2026-08-25' GLOB '____-__-__'` is `0`. `LIKE` would be the opposite mistake, accepting `abcd-ef-gh`.
  Migration 1 now uses `GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`, and `specs/data-model.md` is fixed. This
  had passed a spec review.
- **`sql:default` is not enough.** It grants only `allow-close`, `allow-load`, `allow-select` — confirmed in the
  plugin's own `permissions/default.toml`. Without `sql:allow-execute`, migrations still apply and every `SELECT`
  works, so nothing looks wrong while every write silently fails and the database stays empty. The technical stack
  described this trap but understated it.

### Fixed in response to the reviews

- **`settings.key` was nullable.** A `TEXT PRIMARY KEY` in a non-`STRICT` table accepts `NULL` — a legacy quirk — so
  several unreadable rows could accumulate that no upsert could ever reach. Fixed in migration 1 while it was still
  unfrozen, which is exactly what this plan reserved the right to do.
- **A real-engine schema test, at no dependency cost.** Node ships `node:sqlite`, so `src/db/migrations.test.js`
  extracts the DDL from `migrations.rs` and executes it. Reintroducing the `GLOB` bug now fails the suite; so do
  flipping `RESTRICT` to `CASCADE`, dropping the partial index predicate, and reverting the `NOT NULL`. This closes
  the gap that let the original bug ship, and it means no `rusqlite` dev-dependency needs asking for.
- **Three assertions that could not fail.** The weekly range test checked only bind values, so `> $1 AND < $2`
  (dropping Monday and Sunday) and `BETWEEN $2 AND $1` (returning nothing, ever) both passed. "Creates the entry not
  done" inspected the bind array, but `done` is a literal in the SQL, so creating every entry pre-ticked passed too.
  All three mutants now die.
- **Source guards for the three traps that only fail at runtime**: the database URL matching between `lib.rs` and
  `client.js`, the `sqlite` cargo feature, and both SQL permissions.
- **`src/lib/instants.js`.** The layer correctly takes `createdAt` as an argument but nothing produced one, so the
  first caller would have written `toISOString()` — which includes milliseconds. Since `created_at` is the sort key
  and compared as text, `.` sorts before `Z`, so a database mixing the two formats orders later entries first,
  permanently. Caught before any row existed.
- **`client.js` documents why a failed load is not retried.** Resetting the cached promise looks like an obvious
  improvement and is a trap: the plugin removes the migration list from its map *before* checking whether the
  migration succeeded, so a retry succeeds against a schema that was never created.
- Spec corrections: migrations run on the first query, **not** at startup (nothing preloads the connection); the
  database is in the *config* directory, not the data directory (identical on macOS, different on Linux); `trim()`
  strips only U+0020, so the name CHECK is a backstop and not validation; and the pooling constraint that makes
  multi-statement transactions unreachable from JavaScript — which milestone 10 requires.

### Open, and deliberately not decided here

**Settled by Julien on 2026-08-24: use a transaction, built in JavaScript.** The import is one `execute()` call
carrying the whole `BEGIN IMMEDIATE … COMMIT;` script, which sqlx steps on a single acquired connection. No Rust
command, so the boundary rule in this plan stands and there is no conflict with `specs/technical-stack.md`. The open
sub-question is the failure path — a mid-script error does not auto-rollback and the connection returns to the pool
with the transaction open — which milestone 10 must verify empirically and handle.

Milestone 10 will also need read-everything and delete-everything functions that this layer does not have.

### Not verified

Nothing calls `getDatabase()` yet, so the final probe creates no database file: the round-trip evidence came from
temporary scaffolding that has been removed, as the plan required. Milestone 4 is the first real caller and owes the
user the startup toast. No UI, no export/import, and nothing tested on Windows or Linux.
