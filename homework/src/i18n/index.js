// The i18next instance the whole application shares.
//
// Importing this module initialises i18next: both catalogs are bundled, so
// `init` completes synchronously and no component ever has to wait for a
// translation to arrive. `src/main.jsx` imports it before the first render, and
// so does any test that renders a component using `useTranslation`.
//
// It knows nothing about the database. `preference.js` is the bridge to the
// stored choice, which keeps this module importable from a component test
// without dragging the Tauri SQL plugin in with it.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from "@/i18n/language";
import { startDocumentLanguageSync } from "@/lib/document-language";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  // The real language is resolved before the first render, in `preference.js`.
  // English is what the instance speaks until then, and what it falls back to
  // for a key French is missing — the catalogue parity test is what stops that
  // fallback from being how a missing translation gets discovered.
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  // React escapes what it renders; i18next escaping on top of it would
  // double-encode.
  interpolation: { escapeValue: false },
});

// `<html lang>` follows from here on. Started once, alongside the instance it
// listens to, rather than from a component effect that could unmount.
startDocumentLanguageSync(i18n);

export default i18n;
