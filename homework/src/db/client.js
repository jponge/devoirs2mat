// The one connection to the database.
//
// `Database.load` opens a connection pool on the Rust side and runs any
// outstanding migrations. It must therefore happen once and be shared: calling
// it per query would ask the plugin to re-resolve the pool on every read.
//
// The promise is cached, not the resolved database, so that concurrent callers
// during startup all await the same load rather than racing to start their own.
//
// This module only exists inside the Tauri runtime. `pnpm dev` and vitest have
// no plugin behind the `invoke` call, which is why tests fake
// `@tauri-apps/plugin-sql` instead of exercising it.
import Database from "@tauri-apps/plugin-sql";

// The plugin resolves this with `app_config_dir()`, so the file lives in the
// application *config* directory for `org.ponge.homework`, not the data
// directory. They are the same path on macOS and different on Linux.
//
// The Rust side registers the migrations under this exact string. If the two
// drift, the app opens an un-migrated database and every query fails with
// `no such table` — `schema.test.js` pins them together.
export const DATABASE_URL = "sqlite:homework.db";

let pending = null;

// Deliberately does NOT reset `pending` when the load fails, which looks like an
// obvious improvement and is a trap. The plugin removes the migration list from
// its map before checking whether the migration succeeded, so a second
// `Database.load` after a failed migration *succeeds* and registers a pool
// against a schema that was never created — turning a loud failure into silent
// `no such table` errors forever after. A cached rejection is the honest
// outcome: the failure keeps reporting itself and a relaunch is the fix.
//
// The first caller is `src/i18n/preference.js`, which reads `settings.language`
// before the first render — so that is where the connection opens, where the
// migrations run, and where a failure is caught. It hands the error to `App`,
// which holds it until milestone 6 turns it into the toast that
// `specs/functional-specs.md` requires for a migration error.
export function getDatabase() {
  if (pending === null) {
    pending = Database.load(DATABASE_URL);
  }
  return pending;
}
