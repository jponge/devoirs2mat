// Which language the application speaks, decided as a pure function.
//
// `specs/functional-specs.md`: "On startup the language is the one the user last
// chose; if there is none yet it is detected from the system locale (prefix
// match on the webview locale), falling back to English for anything that is
// neither English nor French."
//
// That is the whole rule, and it is four lines of comparison — which is why no
// locale-detector dependency is installed. Nothing here touches the database,
// i18next or the document: `preference.js` reads the stored value and `index.js`
// applies the answer.

// The `settings` key holding the choice. Absent until the user picks one, which
// is what makes detection the fallback rather than a stored default.
export const LANGUAGE_SETTING_KEY = "language";

export const SUPPORTED_LANGUAGES = ["en", "fr"];

export const FALLBACK_LANGUAGE = "en";

// `fr-CA` and `FR-fr` are both French. A BCP 47 tag starts with its language
// subtag, so the prefix before the first `-`, lower-cased, is the match key.
function languageOf(tag) {
  if (typeof tag !== "string") {
    return null;
  }
  const language = tag.toLowerCase().split("-")[0];
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return null;
  }
  return language;
}

// `stored` is the raw `settings.language` value, or `null` when absent.
// `locales` is the webview's ordered list of preferred locales.
//
// The stored value goes through the same match as a locale on purpose: it is
// user-writable through an import, so anything that is not English or French is
// ignored rather than trusted and handed to i18next.
export function resolveLanguage(stored, locales = []) {
  const chosen = languageOf(stored);
  if (chosen !== null) {
    return chosen;
  }

  for (const locale of locales ?? []) {
    const detected = languageOf(locale);
    // The first *supported* entry wins, not the first entry: a webview asking
    // for ["de", "fr-CA", "en"] gets French.
    if (detected !== null) {
      return detected;
    }
  }

  return FALLBACK_LANGUAGE;
}

// The webview's preferences, as a plain array. `nav` is injectable so this is
// testable without stubbing a global.
export function webviewLocales(
  nav = typeof navigator === "undefined" ? null : navigator,
) {
  if (nav === null || nav === undefined) {
    return [];
  }
  if (Array.isArray(nav.languages) && nav.languages.length > 0) {
    return [...nav.languages];
  }
  if (typeof nav.language === "string" && nav.language !== "") {
    return [nav.language];
  }
  return [];
}
