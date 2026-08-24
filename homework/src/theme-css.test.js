// @vitest-environment node
//
// These are source guards, not appearance tests. They read files from disk and
// assert that load-bearing lines are still there, because every regression they
// cover is silent: no build error, no other failing test.
//
// The node environment is needed for a subtle reason. `import.meta.url` itself is
// a file URL under jsdom too — but Vite treats `new URL(<relative>, import.meta.url)`
// as an asset reference and rewrites it to an http URL in web transform mode, which
// `fileURLToPath` then rejects. Reading the file with `?raw` is not an alternative:
// `@tailwindcss/vite` processes index.css and the import yields an empty string,
// which would make every assertion below pass vacuously.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const css = read("./index.css");
const mainJs = read("./main.jsx");
const bootJs = read("./boot.jsx");
const indexHtml = read("../index.html");

describe("src/index.css source guard", () => {
  it("keeps the four imports the theme is built from", () => {
    for (const imported of [
      "tailwindcss",
      "tw-animate-css",
      "shadcn/tailwind.css",
      "@fontsource-variable/inter",
    ]) {
      expect(css).toContain(`@import "${imported}";`);
    }
  });

  it("keeps the custom variant that connects dark: utilities to the .dark class", () => {
    expect(css).toContain("@custom-variant dark (&:is(.dark *));");
  });

  // Without these, Tailwind scans the test files and ships utilities that only a
  // test ever mentioned — and a test could conjure a class production code then
  // silently depends on.
  it("keeps test files out of the Tailwind source scan", () => {
    expect(css).toContain('@source not "./**/*.test.*";');
    expect(css).toContain('@source not "./**/*.spec.*";');
    expect(css).toContain('@source not "./test-setup.js";');
  });
});

describe("theme wiring source guard", () => {
  // Guarding index.css alone is not enough: the stylesheet can stop reaching the
  // application, or the sync can stop being started, with the CSS itself intact.
  it("loads the stylesheet into the application", () => {
    expect(mainJs).toContain('import "@/index.css";');
  });

  it("starts the system theme sync", () => {
    // Lives in boot.jsx since the boot step was split out so it could be tested.
    expect(bootJs).toContain("startSystemThemeSync();");
  });

  // The pre-paint script is what stops a dark system flashing the light palette.
  // It has to be inline, so no import graph reaches it and nothing else notices
  // if it disappears.
  it("keeps the pre-paint script that applies the theme before first paint", () => {
    expect(indexHtml).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(indexHtml).toContain('classList.add("dark")');
  });

  // The query string exists in two places that cannot import each other: the
  // inline script above and src/lib/theme.js. If they disagree, the window paints
  // one theme and then flips to the other.
  it("agrees with theme.js on the media query", () => {
    const theme = read("./lib/theme.js");
    expect(theme).toContain('"(prefers-color-scheme: dark)"');
    expect(indexHtml).toContain('"(prefers-color-scheme: dark)"');
  });
});
