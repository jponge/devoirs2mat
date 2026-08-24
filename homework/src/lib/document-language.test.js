import { describe, it, expect, vi } from "vitest";
import {
  applyDocumentLanguage,
  startDocumentLanguageSync,
} from "@/lib/document-language";

// A stand-in for `document.documentElement`: only the `lang` attribute is used.
function fakeRoot() {
  return document.createElement("html");
}

// A stand-in for the i18next instance, with just the emitter surface this
// module touches. `fire` is what `i18n.changeLanguage` would trigger.
function fakeI18n(language) {
  const listeners = new Set();
  return {
    resolvedLanguage: language,
    on: vi.fn((event, listener) => {
      if (event === "languageChanged") {
        listeners.add(listener);
      }
    }),
    off: vi.fn((event, listener) => {
      if (event === "languageChanged") {
        listeners.delete(listener);
      }
    }),
    fire(next) {
      for (const listener of [...listeners]) {
        listener(next);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe("applyDocumentLanguage", () => {
  it("writes the language onto the document element", () => {
    const root = fakeRoot();

    applyDocumentLanguage("fr", root);

    expect(root.getAttribute("lang")).toBe("fr");
  });

  it("replaces a language that was already there", () => {
    const root = fakeRoot();
    root.setAttribute("lang", "en");

    applyDocumentLanguage("fr", root);

    expect(root.getAttribute("lang")).toBe("fr");
  });
});

describe("startDocumentLanguageSync", () => {
  it("applies the current language immediately", () => {
    const root = fakeRoot();
    root.setAttribute("lang", "en");

    startDocumentLanguageSync(fakeI18n("fr"), root);

    expect(root.getAttribute("lang")).toBe("fr");
  });

  it("follows every language change", () => {
    const root = fakeRoot();
    const i18n = fakeI18n("en");

    startDocumentLanguageSync(i18n, root);
    expect(root.getAttribute("lang")).toBe("en");

    i18n.fire("fr");
    expect(root.getAttribute("lang")).toBe("fr");

    i18n.fire("en");
    expect(root.getAttribute("lang")).toBe("en");
  });

  it("stops following once the returned function is called", () => {
    const root = fakeRoot();
    const i18n = fakeI18n("en");

    const stop = startDocumentLanguageSync(i18n, root);
    stop();

    expect(i18n.listenerCount()).toBe(0);

    i18n.fire("fr");
    expect(root.getAttribute("lang")).toBe("en");
  });

  // Subscribing is the point; an instance that has not settled on a language yet
  // must not write `lang="undefined"` in the meantime.
  it("leaves the attribute alone when i18next has no language yet", () => {
    const root = fakeRoot();
    root.setAttribute("lang", "en");
    const i18n = fakeI18n(undefined);

    startDocumentLanguageSync(i18n, root);

    expect(root.getAttribute("lang")).toBe("en");

    i18n.fire("fr");
    expect(root.getAttribute("lang")).toBe("fr");
  });
});
