// The version of the schema the running application produces and understands.
//
// Migration 1 in `src-tauri/src/migrations.rs` is what this number refers to.
// Bump it in the same change that appends a migration — the two are a pair, and
// nothing detects a mismatch automatically.
//
// This is the `N` in the export header (`-- devoirs2mat schema-version: N`) and
// the value an import is checked against. It is deliberately a code constant and
// deliberately not stored in the database: the plugin already tracks what has
// been applied in `_sqlx_migrations`, which we never read, write, export or
// mirror.
export const SCHEMA_VERSION = 1;
