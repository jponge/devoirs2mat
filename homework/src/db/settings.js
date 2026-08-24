// Application preferences, as untyped key/value pairs.
//
// A key may simply be absent, and `getSetting` reports that as `null`. Every
// reader defines its own default in one place rather than defaulting here — the
// language preference, for instance, falls back to locale detection, which this
// layer knows nothing about.
import { getDatabase } from "@/db/client";

export async function getSetting(key) {
  const db = await getDatabase();
  const rows = await db.select("SELECT value FROM settings WHERE key = $1", [
    key,
  ]);
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key, value) {
  const db = await getDatabase();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
