# Technical stack and tooling

## Use Mise

- Do not assume or recommend that tools are installed globally
- Use [Mise](https://mise.jdx.dev/), see `mise.toml`
- If a new tool is needed, propose to add it to the local Mise configuration

## Tauri application

- The application uses [Tauri version 2](https://v2.tauri.app/)
    - We target desktop applications (Windows, macOS and Linux)
    - We do not have plans for Android / iOS
    - Data persistence will be done using the [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/) and SQLite
- The application is named **Devoirs2mat** everywhere, and the name is never translated: `productName` in
  `tauri.conf.json`, the window title, the `<title>` in `index.html`, and the installers
- The code is written in JavaScript
- `pnpm` is the only allowed Node tool, do not use `npm`, `yarn`, `npx`, etc
- `vite` is the target build tool
- The user interface layer is written using [React](https://react.dev/), and we use a functional React style to define
  components, not classes
- The user interface uses [shadcn](https://ui.shadcn.com/) components, and we use a preset code `b7W7uXIq8` (as in
  `pnpm dlx shadcn@latest apply --preset b7W7uXIq8`) to define the appearance
- The application is self-contained and never requires any network connectivity **at runtime**: no remote account, no
  download of CSS, JavaScript, fonts or icons. Fonts and assets are bundled, or we use the system font stack.
  Build-time network access (`pnpm install`, `pnpm dlx`) is fine

## What is not bootstrapped yet

The `create-tauri-app` starter has been stripped, and Tailwind CSS, shadcn, the SQL plugin and internationalization
are in place. The following is still not installed, so do not assume it is there and do not treat setting it up as
over-engineering — set it up as its own dedicated change rather than as a side effect of a feature:

- the dialog and fs plugins used by export and import

## Persistence

**This is a single-user, single-instance application.** One student, one window, one process, one local SQLite file.
There is no second user, no second instance, no server and no sync. Do not design for concurrent writers, locking,
conflict resolution or cross-process coordination — none of it applies. Where a library detail such as sqlx's
internal connection pool matters, it matters only for our own process, and the simplest thing that works is the right
thing.

- The database is `sqlite:homework.db`, in the Tauri application **config** directory, opened once and shared. It is
  the config directory and not the data directory: the plugin resolves the path with `app_config_dir()`. On macOS the
  two coincide (`~/Library/Application Support/<identifier>`), on Linux they do not (`~/.config/…` versus
  `~/.local/share/…`), which is where that assumption bites
- The connection opens **lazily**, on the first query. Since milestone 4 that first query is the language read that
  `src/startup.js` performs before the first render — so migrations do now run at startup in practice, and that is
  the code that owes the user a toast. Every migration added later extends that pre-paint window
- That read is raced against a deadline so a database that never answers cannot leave the user staring at an empty
  window. **A timeout is not a failure**: it settles with the detected language and *no* error, because reporting one
  would tell a student their data is broken when a migration merely took a moment, and nothing could retract it. The
  read is left running; if it answers late it has already applied the stored language, so the interface flips after
  paint — the flash this arrangement exists to avoid, accepted only on a path that is already degraded, because the
  choice the user actually made has to win. A real error arriving late is delivered through `onLate`
- The tables, columns, constraints and invariants are specified in [the data model](data-model.md)
- Schema migrations are owned by the Rust side: declare them as `tauri_plugin_sql::Migration` in
  `src-tauri/src/migrations.rs`. This is the one deliberate exception to "the code is written in JavaScript"
- Migrations are append-only: never edit a migration that has already shipped
- Queries and mutations go through the JavaScript plugin API. Add a Rust `#[tauri::command]` only when the SQL plugin
  genuinely cannot do the job
- **The import runs in a transaction, and it is built in JavaScript.** The plugin acquires a connection from an sqlx
  pool *per invoke*, so `execute("BEGIN")`, `execute(…)`, `execute("COMMIT")` as three separate calls are not
  guaranteed to land on the same connection and are not atomic. The import is therefore **one `execute()` call
  carrying the whole `BEGIN IMMEDIATE … COMMIT;` script**: sqlx steps a multi-statement string on a single acquired
  connection, so that is a real transaction. Do not add a Rust command for it — the SQL plugin can do this job
- One edge to check when milestone 10 builds it: a statement failing mid-script does **not** auto-rollback in SQLite,
  and sqlx does not roll back when the connection returns to its pool, so that connection can be left holding an open
  write transaction. Nobody else is competing for the database, so the only victim is our own next query — but a
  half-applied import is exactly what the transaction exists to prevent. Check it empirically rather than assuming
  the failure path cleans itself up
- The `sqlite` cargo feature must be enabled on `tauri-plugin-sql`, otherwise the crate compiles and every query fails
  at runtime
- `src-tauri/capabilities/default.json` needs **both** `"sql:default"` and `"sql:allow-execute"`. `sql:default` grants
  only `allow-close`, `allow-load` and `allow-select` — reads. Without `sql:allow-execute` the application starts
  normally, the migrations apply (they run on the Rust side, outside the capability system) and every `SELECT` works,
  so nothing looks wrong; every `INSERT`, `UPDATE` and `DELETE` fails with
  `sql.execute not allowed. Permissions associated with this command: sql:allow-execute`. Verified in milestone 3 by
  removing the entry and watching the writes disappear
- Versions resolved on 2026-08-24: `tauri-plugin-sql` 2.4.0 (with sqlx 0.8.6), `@tauri-apps/plugin-sql` 2.4.0

## Testing

- Frontend: `vitest` with `jsdom` and `@testing-library/react`, all three as dev dependencies. Tests are colocated
  next to the code they cover: `src/**/*.test.jsx` for components, `src/**/*.test.js` for pure logic
- `pnpm test` maps to `vitest run` (single shot, never watch mode, which would hang an agent). `pnpm test:watch` is
  the interactive variant
- Test the pure logic first — dates, grouping, SQL script generation and parsing — and components with the data layer
  faked. Do not try to run the Tauri SQL plugin inside tests: it only exists in the Tauri runtime
- The `test` block belongs in `vite.config.js`, **not** a standalone `vitest.config.js`. Vitest only inherits
  `resolve.alias` from the config it actually reads, and a separate file means every `@/…` import in a test fails to
  resolve. Note that `vite.config.js` is an async factory and registers `@tailwindcss/vite`, so merging needs care
- `globals` is deliberately **off**. This project has no TypeScript and therefore no ambient global types, so every
  test imports `describe`, `it`, `expect` and `vi` from `"vitest"` explicitly
- Because `globals` is off, React Testing Library does not clean up between tests on its own: a component rendered in
  one test would still be in the document in the next, and queries would find duplicates. `src/test-setup.js`, wired
  through `setupFiles`, registers `afterEach(cleanup)` and is the only reason that works. Do not delete it
- jsdom implements neither `window.matchMedia` nor `prefers-color-scheme`. Pass a fake `win` to
  `startSystemThemeSync` rather than reaching for a global stub, and never import `src/main.jsx` from a test: it
  calls `createRoot` on a `#root` element that does not exist there
- A test that reads a file from disk needs a `// @vitest-environment node` docblock on its first line, as
  `src/theme-css.test.js` has. The cause is **not** that jsdom breaks `import.meta.url` — that stays a `file:` URL in
  both environments. It is that Vite treats `new URL(<relative>, import.meta.url)` as an *asset reference* and
  rewrites it to an `http:` URL in web transform mode, which `fileURLToPath` then rejects. Either the docblock or
  `path.dirname(fileURLToPath(import.meta.url))` avoids it; "reads a file, therefore node environment" is not a rule
- Importing CSS with `?raw` is not an alternative to reading it: `@tailwindcss/vite` processes the file first and the
  test sees an **empty string**, so every assertion passes vacuously
- `pnpm test` is `vitest run --watch=false`. The `--watch=false` is not redundant: vitest deliberately honours a
  trailing `--watch` even after `run`, so plain `vitest run` lets `pnpm test --watch` hang forever. With the flag,
  that invocation fails fast instead
- The `test` block sets `restoreMocks`, `unstubGlobals` and `unstubEnvs`, so spies and stubbed globals do not leak
  between tests. Milestone 3's module-level fakes for the SQL plugin depend on this
- `TZ` is pinned to `Europe/Paris` in the `test` block. Deliberately not UTC: the wrong-day bugs the date helpers
  exist to prevent only appear in an offset zone, so a UTC pin would hide exactly what those tests are for. Paris is
  not sufficient on its own, though, and the pin must not be trusted as if it were: it is a *positive* offset, where
  UTC midnight always falls on the same local calendar day, so a helper reading the local day parts instead of the UTC
  ones passes every Paris test there is. Each date helper therefore also needs a test that stubs `TZ` to a
  negative-offset zone — `vi.stubEnv("TZ", "America/New_York")`, which `unstubEnvs` restores — and asserts the same
  answers. Date helpers should still take an explicit "today" argument rather than reading the clock, the same way
  `startSystemThemeSync` takes `win`
- Never assert a module's constant against itself (`expect(fn).toHaveBeenCalledWith(DARK_QUERY)` where `DARK_QUERY`
  is imported from the module under test). That is unfalsifiable — inverting the constant keeps the suite green. Pin
  the literal string instead
- jsdom implements none of `ResizeObserver`, `IntersectionObserver`, `Element.prototype.scrollIntoView` or
  `hasPointerCapture`, all of which the Radix components behind shadcn's drawer, select and dialog use. Milestone 6
  will need polyfills in `src/test-setup.js`; this is expected, not a bug to investigate
- Colours and layout are never asserted on: that needs a real browser, and there is no WebDriver setup. Light and
  dark rendering stays a human check. What *is* pinned down is the wiring — `src/theme-css.test.js` guards the
  imports and the `@custom-variant dark` line in `src/index.css`, whose loss would break every `dark:` utility with
  no build error
- Versions resolved when the tooling was bootstrapped on 2026-08-24: `vitest` 4.1.11, `jsdom` 30.0.1,
  `@testing-library/react` 16.3.2. `@testing-library/dom` comes in as a peer dependency of the last one and is not
  declared in `package.json`. `@testing-library/jest-dom` and `@testing-library/user-event` are deliberately **not**
  installed; ask before reaching for either
- Rust: plain `#[cfg(test)]` unit tests, run with `cargo test` from `homework/src-tauri`
- There is no end-to-end or WebDriver setup and none is planned. Do not propose Playwright or `tauri-driver`

## Internationalization

- `i18next` and `react-i18next`, with the message catalogs in `homework/src/i18n/{en,fr}.json`
- Dates and numbers are formatted with `Intl`, using the active language. Do not add a date library without asking
- The module layout, all under `src/i18n/`:
    - `language.js` — the resolution rule as a **pure** function (`resolveLanguage(stored, locales)`) plus
      `LANGUAGE_SETTING_KEY`, `SUPPORTED_LANGUAGES` and `FALLBACK_LANGUAGE`. It touches neither the database nor
      i18next, which is what makes every case in `specs/functional-specs.md` a plain unit test
    - `index.js` — the shared i18next instance. Importing it initialises i18next; both catalogs are bundled, so
      `init` completes synchronously and nothing ever waits on a translation. It deliberately does **not** import
      `src/db/`, so a component test can import it without dragging the Tauri SQL plugin along
    - `preference.js` — the bridge to storage: `startLanguage()` and `setLanguage()`. This is the only place that
      reads or writes `settings.language`, and it goes through `src/db/settings.js` like everything else
- **No `i18next-browser-languagedetector`.** The rule is a prefix match on the webview locale with an English
  fallback — a few lines we can test exactly, against a dependency whose default detection order (querystring,
  cookie, localStorage…) is built for the web and would need configuring down to almost nothing
- The stored value goes through the same match as a locale: a `settings.language` that is neither English nor French
  is **ignored**, not handed to i18next. That row is user-writable through an import
- The language is resolved **before the first render**, in `src/main.jsx`. It costs one local SQLite read on a
  single-user desktop application, and rendering first would show a visible flash of the wrong language. It is also
  the first thing in the application to call `getDatabase()`, so it is where the connection opens and the migrations
  run for the first time
- `startLanguage` therefore owns the startup failure path: a database that cannot be opened comes back as
  `{ language, error }` rather than as a rejection. The application still renders, in the *detected* language, and
  the error is handed to `App` as `startupError`, which **holds** it. `specs/functional-specs.md` requires it to be
  reported with a toast; the toast component arrives with the drawer in milestone 6, which owes the user that report.
  Do not turn the error into a silent `catch`
- A startup failure is never persisted and detection is never written back: `settings.language` stays absent until
  the user actually picks a language
- `src/i18n/catalogs.test.js` asserts that `en.json` and `fr.json` have **identical key sets**, recursively. English
  is the fallback language, so a missing French translation would otherwise be invisible: it would quietly render in
  English rather than fail
- Only strings that actually exist are in the catalogs. Do not add keys for screens that are not built yet
- `<html lang>` follows the active language, through `src/lib/document-language.js`. That module is the only place
  allowed to own the `lang` attribute, the same way `src/lib/theme.js` is the only place allowed to own the `.dark`
  class, and it takes the target element as an argument for the same reason. It subscribes to i18next's
  `languageChanged` once, next to the instance, rather than from a component effect that could unmount
- Versions resolved on 2026-08-24: `i18next` 26.4.0, `react-i18next` 17.0.12

## User interface

- shadcn requires Tailwind CSS. Both are set up; the section below records exactly how, so the setup is reproducible
  from this repository alone
- The project is JavaScript: `components.json` says `"tsx": false` and there is **no** `tsconfig.json`. Never
  introduce TypeScript into this project — a wrong answer here poisons every component generated afterwards
- The generated CSS variables in `src/index.css` are the source of truth for the *palette*. Do not re-run
  `shadcn apply --preset` without asking: it overwrites the theme. Note the theme is split across two files — the
  palette is in `src/index.css`, but the variants and keyframes the generated components rely on come from
  `shadcn/tailwind.css`, resolved from the `shadcn` package. A `pnpm update` can therefore change theme CSS with no
  diff under `src/`
- The head of `src/index.css` is load-bearing — do not count lines, they move: the four `@import`s, the
  `@source not` exclusions, and `@custom-variant dark (&:is(.dark *))` which is what connects every `dark:` utility
  to the `.dark` class. Deleting the variant silently kills dark mode with no build error. Note it matches
  descendants only, so a `dark:` utility written directly on `<html>` would never match
- The `@source not` lines keep Tailwind from scanning test files. Without them it emits utilities for any
  utility-looking string in a test — the word "transform" in a comment was enough to ship a `.transform` rule — and,
  worse, a test could conjure a class that production code then silently depends on. `src/theme-css.test.js` guards
  all of this, because every one of these regressions is otherwise silent
- Generated shadcn components live in `src/components/ui/` and are not edited by hand
- The theme follows the system appearance, using the preset's light and dark palettes. There is no theme switch, so
  nothing about the theme is stored in the database. The preset puts its dark palette behind a `.dark` class and
  emits no `prefers-color-scheme` media query, so the operating system setting is mirrored onto `<html class="dark">`
  in two places, both required: an inline script in `index.html` applies it **before first paint**, which is intended
  to stop a dark system flashing the light palette, and `src/lib/theme.js` keeps it in sync afterwards. That the
  script is present and ordered ahead of the stylesheet is guarded by a test; that the flash is actually absent has
  never been observed by anyone and no automated check can reach it. That module is the only code
  allowed to own the `.dark` class, and it takes `win` and `root` as arguments so it can be tested without a browser.
  It is started *after* the first render, so a webview that cannot mirror the theme still shows the application
  rather than a blank window. `index.html` also declares `<meta name="color-scheme" content="light dark" />` so
  native scrollbars and form controls follow. Do not add an in-application switch on top of this
- Failures are reported with the preset's toast component. The functional specifications say when a toast is used
  rather than an inline message
- Homework text is Markdown, rendered with `react-markdown` and restricted to the inline subset defined in the
  functional specifications, using `allowedElements`. Raw HTML is never enabled: no `rehype-raw`, and no
  `dangerouslySetInnerHTML` anywhere in the code base. Rendering to React elements rather than to an HTML string is
  what makes user text unable to become live markup inside the webview, and it is why no separate sanitizer is needed
- Links inside homework text are opened in the system browser with `@tauri-apps/plugin-opener`, which is already a
  dependency. They must never navigate the application webview, which would unmount the application. Opening a link
  is a user action and does not contradict the offline rule: the application itself still never needs the network

### How Tailwind CSS and the shadcn preset were set up

Done in one dedicated change, with shadcn CLI **4.19.0**, node 26.7.0 and pnpm 11.21.0. Every command runs from
`homework/`.

**Order matters.** On a Vite project the shadcn CLI refuses to initialise until Tailwind CSS *and* an import alias
already exist — it fails with "No Tailwind CSS configuration found" and "Could not find valid path aliases". So
Tailwind is installed and wired first, and `init` comes after.

```
# 1. Tailwind CSS, as a dev dependency, wired through the Vite plugin (no PostCSS config)
pnpm add -D tailwindcss @tailwindcss/vite

# 2. the CSS entry point: src/index.css, containing `@import "tailwindcss";`,
#    imported once from src/main.jsx

# 3. the `@/` alias, in vite.config.js and jsconfig.json (see below)

# 4. initialise shadcn — non-interactive
pnpm dlx shadcn@latest init -y -b radix -p luma < /dev/null

# 5. apply the preset — run exactly once
pnpm dlx shadcn@latest apply --preset b7W7uXIq8 -y < /dev/null

# 6. the components this change needed
pnpm dlx shadcn@latest add card button -y < /dev/null
```

Notes on the flags, because an interactive prompt hangs an agent:

- `-y` alone is **not** enough for `init`: the CLI still prompts "Which preset would you like to use?". `-p <name>`
  is what makes it unattended. `-b radix` likewise pre-answers the component-library question
- `-p luma` at `init` is not the theme. `pnpm dlx shadcn@latest preset decode b7W7uXIq8` reports the preset as
  style `luma`, base colour `taupe`, `lucide` icons, `inter` font — so `init` gets the right *style*, and step 5 is
  the single `apply` that writes the actual palette. Do not read `-p luma` as a substitute preset
- `< /dev/null` is deliberate: if a future CLI version adds a prompt, the command fails fast instead of hanging
- `preset decode`, `preset url` and `info` are read-only and safe to run at any time
- **To reproduce this exact setup, use `pnpm dlx shadcn@4.19.0`.** `@latest` is what was actually run on 2026-08-24
  and it resolved to 4.19.0; a later CLI may generate different components or a different theme
- there is **no flag** for the JavaScript-versus-TypeScript answer: the CLI infers JavaScript from the *absence* of a
  `tsconfig.json`. A stray `tsconfig.json` in the tree silently yields `"tsx": true`. Check `components.json` right
  after `init` and before `apply`

Generated and hand-written files:

| path | origin | what it is |
|---|---|---|
| `homework/components.json` | `init`, then `apply` | shadcn config: `"tsx": false`, `"style": "radix-luma"`, `"baseColor": "taupe"`, `"iconLibrary": "lucide"` |
| `homework/src/index.css` | hand-written, then rewritten by `init` and `apply` | the CSS entry point and the theme; imported from `src/main.jsx` |
| `homework/src/lib/utils.js` | `init` | the `cn()` helper every generated component imports |
| `homework/src/components/ui/{card,button}.jsx` | `add` | generated components, not hand-edited |
| `homework/jsconfig.json` | hand-written | the `@/` alias for the editor |
| `homework/vite.config.js` | hand-edited | the `@/` alias for the build, plus the Tailwind plugin |

The `@/` alias is declared twice and both are required:

- `vite.config.js` resolves it at build time. That file is ESM and has no `__dirname`, so the path is built with
  `fileURLToPath(new URL("./src", import.meta.url))` — getting this wrong fails at import time with a confusing
  message
- `jsconfig.json` maps `@/*` to `./src/*` for the editor, and needs `baseUrl` — some shadcn CLI versions require it
  to detect the alias at all. It is a `jsconfig.json`, never a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Packages the setup added, at the versions resolved on 2026-08-24. Three of them — `radix-ui` (the umbrella, rather
than the individual `@radix-ui/react-*` packages), `shadcn` itself, and `@fontsource-variable/inter` — were installed
by the CLI rather than chosen, and were ratified after the fact:

| package | version | where |
|---|---|---|
| `tailwindcss` | 4.3.3 | dev |
| `@tailwindcss/vite` | 4.3.3 | dev |
| `class-variance-authority` | 0.7.1 | prod |
| `clsx` | 2.1.1 | prod |
| `tailwind-merge` | 3.6.0 | prod |
| `tw-animate-css` | 1.4.0 | prod |
| `lucide-react` | 1.33.0 | prod |
| `radix-ui` | 1.6.7 | prod |
| `shadcn` | 4.19.0 | prod |
| `@fontsource-variable/inter` | 5.3.0 | prod |

Three of those are worth knowing about, because they are not what you would guess:

- `shadcn` is a **runtime dependency**, not just a CLI run through `pnpm dlx`. CLI 4.x makes `src/index.css` do
  `@import "shadcn/tailwind.css";`, so the package has to be installed for the build to resolve that import. It is
  pinned to an **exact** version, not a caret range: half the theme (the variants and keyframes the generated
  components rely on) lives inside that package, so a caret range would let `pnpm update` change the theme with no
  diff under `src/` — which the rule above forbids doing without asking.
  `pnpm dlx shadcn@4.19.0 eject` would inline it and drop the dependency; that remains an open decision
- the CLI installs the `radix-ui` umbrella package rather than the individual `@radix-ui/react-*` packages, and the
  generated components import from it (`import { Slot } from "radix-ui"`). Later components therefore need no new
  *Radix* dependency — but two things still will: the registry's `toast` is deprecated in favour of **`sonner`**, and
  any calendar or date picker pulls **`react-day-picker`**, which brushes against the "no date library" rule above.
  Both need approval when the milestone that wants them arrives; neither is approved by this section
- the preset's font is Inter, and the CLI installs `@fontsource-variable/inter`, which **bundles** the woff2 files
  into `dist/`. Nothing is fetched from a font CDN, so the offline rule holds. `src/index.css` sets
  `--font-sans: 'Inter Variable', sans-serif`

## File access

- Export and import use `@tauri-apps/plugin-dialog` to choose the path and `@tauri-apps/plugin-fs` to read and write
  the file, entirely from JavaScript. No Rust command is involved
- Both plugins need their cargo dependency, their JS package, **and** their entries in
  `src-tauri/capabilities/default.json` (`dialog:default`, plus the fs read and write permissions). The fs scope has
  to allow the path the user picked in the dialog: that is the part that is easy to get wrong, and it fails at
  runtime rather than at build time

## Code layout under `homework/src`

- `components/ui/` — shadcn components, generated, not hand-edited
- `components/` — our own components
- `db/` — database queries and mutations
- `i18n/` — `en.json`, `fr.json` and the i18next setup
- `lib/` — pure helpers (dates, grouping, SQL import and export, the system-theme mirror, the `<html lang>`
  mirror), where most of the tests
  live. `lib/utils.js` is generated by shadcn and is the exception: it is not hand-edited
- `hooks/` — declared by `components.json` as `@/hooks`; shadcn writes generated hooks there. It does not exist until
  a generated component needs it

No state management library: React hooks plus a single context for the shared homework and course data. Do not add
Redux, Zustand, TanStack Query or a router without asking.
