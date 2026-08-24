import { describe, it, expect } from "vitest";
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_SETTING_KEY,
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  webviewLocales,
} from "@/i18n/language";

// The rule under test is the one `specs/functional-specs.md` states: the stored
// choice wins, otherwise the webview locale is prefix-matched, otherwise
// English. It is pure, so every case is a plain call.
describe("resolveLanguage", () => {
  it("prefers the stored choice over the system locale", () => {
    expect(resolveLanguage("fr", ["en-US"])).toBe("fr");
    expect(resolveLanguage("en", ["fr-FR"])).toBe("en");
  });

  // The `settings` row is user-writable through an import, so a value that is
  // neither language is ignored rather than handed to i18next.
  it("ignores a stored value that is not a supported language", () => {
    expect(resolveLanguage("de", ["fr-FR"])).toBe("fr");
    expect(resolveLanguage("klingon", ["de-DE"])).toBe("en");
    expect(resolveLanguage("", ["fr-FR"])).toBe("fr");
  });

  it("detects the language from the system locale when nothing is stored", () => {
    expect(resolveLanguage(null, ["fr-FR"])).toBe("fr");
    expect(resolveLanguage(null, ["en-GB"])).toBe("en");
  });

  it("prefix-matches rather than requiring an exact locale", () => {
    expect(resolveLanguage(null, ["fr-CA"])).toBe("fr");
  });

  it("falls back to English for an unsupported system locale", () => {
    expect(resolveLanguage(null, ["de-DE"])).toBe("en");
  });

  // The webview offers an ordered list of preferences. The first *supported*
  // entry wins — not the first entry, which would answer English here.
  it("takes the first supported entry of the locale list", () => {
    expect(resolveLanguage(null, ["de", "fr-CA", "en"])).toBe("fr");
    expect(resolveLanguage(null, ["de", "en-US", "fr"])).toBe("en");
  });

  it("falls back to English when there is no system locale at all", () => {
    expect(resolveLanguage(null, [])).toBe("en");
    expect(resolveLanguage(null)).toBe("en");
    expect(resolveLanguage(undefined, undefined)).toBe("en");
  });

  it("does not treat case as significant", () => {
    expect(resolveLanguage(null, ["FR-fr"])).toBe("fr");
    expect(resolveLanguage(null, ["EN"])).toBe("en");
    expect(resolveLanguage("FR", [])).toBe("fr");
  });

  it("survives a locale list holding something that is not a string", () => {
    expect(resolveLanguage(null, [null, undefined, 42, "fr"])).toBe("fr");
  });

  it("only ever answers a supported language", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "fr"]);
    expect(FALLBACK_LANGUAGE).toBe("en");
    expect(LANGUAGE_SETTING_KEY).toBe("language");
  });
});

// jsdom has a `navigator`, but the value the application actually reads is the
// webview's, so the object is injected rather than stubbed globally.
describe("webviewLocales", () => {
  it("prefers the ordered list the browser exposes", () => {
    expect(webviewLocales({ languages: ["fr-FR", "en"], language: "en-US" })).toEqual([
      "fr-FR",
      "en",
    ]);
  });

  it("falls back to the single language when there is no list", () => {
    expect(webviewLocales({ language: "fr-FR" })).toEqual(["fr-FR"]);
    expect(webviewLocales({ languages: [], language: "fr-FR" })).toEqual([
      "fr-FR",
    ]);
  });

  it("answers an empty list when the webview says nothing", () => {
    expect(webviewLocales({})).toEqual([]);
    expect(webviewLocales({ language: "" })).toEqual([]);
    expect(webviewLocales(null)).toEqual([]);
  });
});
