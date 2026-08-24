import { describe, it, expect } from "vitest";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

// Flattens `{ shell: { cardTitle: "…" } }` to `["shell.cardTitle"]`, so nesting a
// catalogue deeper later does not weaken the comparison.
function keyPaths(catalogue, prefix = "") {
  const paths = [];
  for (const [key, value] of Object.entries(catalogue)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      paths.push(...keyPaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths.sort();
}

// i18next appends a CLDR plural category to the key: `items_one`, `items_other`.
// The categories differ per language — English has one/other, French also has
// many — so a *correctly* translated plural has different key sets on each side.
// Comparing raw key paths would reject it, so plurals are compared as base keys
// and their categories are checked separately, per language.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function baseKey(path) {
  return path.replace(/_ordinal$/, "").replace(PLURAL_SUFFIX, "");
}

function baseKeys(catalogue) {
  return [...new Set(keyPaths(catalogue).map(baseKey))].sort();
}

function pluralCategories(catalogue, base) {
  return keyPaths(catalogue)
    .filter((path) => path !== base && baseKey(path) === base)
    .map((path) => path.slice(base.length + 1))
    .sort();
}

// The reason this milestone is worth its own change: English is the fallback, so
// a missing French translation would not break anything visibly — it would just
// silently show English to a French student.
describe("message catalogs", () => {
  it("have identical key sets", () => {
    expect(baseKeys(fr)).toEqual(baseKeys(en));
  });

  // Collapsing to base keys is what lets the two languages have different
  // category sets — but it also hides a key that is pluralised on one side and
  // flat on the other, which renders "3 devoir" forever. Compare that directly.
  it("pluralise the same keys in both languages", () => {
    for (const base of baseKeys(en)) {
      const inEnglish = pluralCategories(en, base).length > 0;
      const inFrench = pluralCategories(fr, base).length > 0;
      expect(inFrench, `${base} is pluralised in only one catalogue`).toBe(
        inEnglish,
      );
    }
  });

  // Stronger than key parity, and something key parity cannot express: a French
  // plural missing its `_many` form is a real gap that identical key sets would
  // never reveal.
  it("carry every plural category their own language requires", () => {
    for (const [language, catalogue] of [
      ["en", en],
      ["fr", fr],
    ]) {
      const required = new Intl.PluralRules(language)
        .resolvedOptions()
        .pluralCategories.slice()
        .sort();

      for (const base of baseKeys(catalogue)) {
        const categories = pluralCategories(catalogue, base);
        if (categories.length === 0) {
          continue; // not a plural key
        }
        expect(categories, `${language}: ${base}`).toEqual(required);
      }

      // Deriving the categories at runtime is only strict on a full-ICU build.
      // Pin the two that matter so a small-ICU runtime weakens the test loudly
      // rather than silently.
      if (language === "fr") {
        expect(required).toContain("many");
      } else {
        expect(required).toEqual(["one", "other"]);
      }
    }
  });

  it("are not empty", () => {
    expect(keyPaths(en).length).toBeGreaterThan(0);
  });

  it("hold a non-empty string at every key", () => {
    for (const catalogue of [en, fr]) {
      for (const path of keyPaths(catalogue)) {
        const value = path
          .split(".")
          .reduce((node, key) => node[key], catalogue);
        expect(typeof value).toBe("string");
        expect(value.trim()).not.toBe("");
      }
    }
  });

  // The application name is never translated, so it must not have crept into a
  // catalogue as a translatable string.
  it("do not translate the application name", () => {
    expect(JSON.stringify(fr)).not.toMatch(/Devoirs2mat/);
    expect(JSON.stringify(en)).not.toMatch(/Devoirs2mat/);
  });
});
