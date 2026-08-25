// The bridge between the language and where it is stored.
//
// Reading the preference is the first thing in the application to call
// `getDatabase()`, so it is where the connection is opened and where the
// migrations actually run for the first time. It is also therefore the place
// that inherits the startup failure path.
import i18n from "@/i18n";
import { getSetting, setSetting } from "@/db/settings";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_SETTING_KEY,
  resolveLanguage,
  webviewLocales,
} from "@/i18n/language";

// Resolves the language and applies it, before the first render.
//
// A single local SQLite read on a single-user desktop application is fast, and
// doing it up front is what avoids a visible flash of the wrong language.
//
// Returns `{ language, error }`. `error` is the database failure, if there was
// one, and it is **returned rather than swallowed**: `specs/functional-specs.md`
// requires a migration error at startup to reach the student as a toast, and the
// caller is what turns it into one. A failure never stops the application from
// rendering — it renders in the detected language instead.
export async function startLanguage(locales = webviewLocales()) {
  let stored = null;
  let error = null;

  try {
    stored = await getSetting(LANGUAGE_SETTING_KEY);
  } catch (caught) {
    error = caught;
  }

  const language = resolveLanguage(stored, locales);
  await i18n.changeLanguage(language);
  return { language, error };
}

// Persists the choice and applies it immediately: no restart, and detection
// never gets a say again. Writing first means a write that fails does not leave
// the interface claiming a language the next launch will not honour.
export async function setLanguage(language) {
  // This is the only writer of the key, and the cheapest place to refuse. An
  // unsupported value would be written, then normalised away by i18next, and
  // silently ignored on the next launch — losing the user's choice with nothing
  // to show for it.
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`unsupported language: ${language}`);
  }
  await setSetting(LANGUAGE_SETTING_KEY, language);
  await i18n.changeLanguage(language);
}
