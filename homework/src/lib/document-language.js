// `<html lang>` follows the active language.
//
// This is the second attribute on the document element the application owns,
// after the `.dark` class in `src/lib/theme.js`, and it is deliberately shaped
// the same way: one module owns one attribute, the target is injectable so it is
// testable without a browser, and nothing else anywhere calls
// `document.documentElement` for it.
//
// `index.html` ships `lang="en"`, which is what the document has until the
// language is resolved. Keeping the attribute honest matters for the same reason
// the theme mirrors the system appearance: hyphenation, spell-checking and
// assistive technology all read it.

export function applyDocumentLanguage(language, root = document.documentElement) {
  root.setAttribute("lang", language);
}

// Applies the language i18next currently has, then follows every change. Returns
// a function that stops following, mirroring `startSystemThemeSync`.
// `root` defaults lazily rather than to `document.documentElement`, because this
// is called at import time from `@/i18n` — unlike `startSystemThemeSync`, which
// `main.jsx` calls after render. A node-environment test that imports anything
// reaching `@/i18n` would otherwise die on `document is not defined`, a long way
// from the cause.
export function startDocumentLanguageSync(i18n, root = undefined) {
  const target =
    root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (target === null) {
    return () => {};
  }
  const sync = (language) => {
    applyDocumentLanguage(language, target);
  };

  const current = i18n.resolvedLanguage ?? i18n.language;
  if (typeof current === "string" && current !== "") {
    sync(current);
  }

  i18n.on("languageChanged", sync);
  return () => {
    i18n.off("languageChanged", sync);
  };
}
