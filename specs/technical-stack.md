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
  `tauri.conf.json`, the window title, the `<title>` in `index.html` (which still carries the starter's
  "Tauri + React"), and the installers
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

`homework/` is still close to the `create-tauri-app` React starter. None of the following is installed, so do not
assume it is there and do not treat setting it up as over-engineering — but set each one up as its own dedicated
change rather than as a side effect of a feature:

- shadcn and Tailwind CSS
- the Tauri SQL plugin, and the dialog and fs plugins used by export and import
- internationalization
- the test tooling

## Persistence

- The database is `sqlite:homework.db`, in the Tauri application data directory, opened once and shared
- The tables, columns, constraints and invariants are specified in [the data model](data-model.md)
- Schema migrations are owned by the Rust side: declare them as `tauri_plugin_sql::Migration` in
  `src-tauri/src/migrations.rs`. This is the one deliberate exception to "the code is written in JavaScript"
- Migrations are append-only: never edit a migration that has already shipped
- Queries and mutations go through the JavaScript plugin API. Add a Rust `#[tauri::command]` only when the SQL plugin
  genuinely cannot do the job
- The `sqlite` cargo feature must be enabled on `tauri-plugin-sql`, and `"sql:default"` must be added to
  `src-tauri/capabilities/default.json`, otherwise every query fails at runtime with an opaque permission error

## Testing

- Frontend: `vitest` with `jsdom` and `@testing-library/react`. Tests are colocated as `src/**/*.test.jsx`
- `pnpm test` maps to `vitest run` (single shot, never watch mode, which would hang an agent). `pnpm test:watch` is
  the interactive variant
- Test the pure logic first — dates, grouping, SQL script generation and parsing — and components with the data layer
  faked. Do not try to run the Tauri SQL plugin inside tests: it only exists in the Tauri runtime
- Rust: plain `#[cfg(test)]` unit tests, run with `cargo test` from `homework/src-tauri`
- There is no end-to-end or WebDriver setup and none is planned. Do not propose Playwright or `tauri-driver`

## Internationalization

- `i18next` and `react-i18next`, with the message catalogs in `homework/src/i18n/{en,fr}.json`
- Dates and numbers are formatted with `Intl`, using the active language. Do not add a date library without asking

## User interface

- shadcn requires Tailwind CSS. The preset has not been applied yet: run `pnpm dlx shadcn@latest init` first, and
  answer **JavaScript**, not TypeScript — `components.json` must end up with `"tsx": false`. Never introduce
  TypeScript into this project
- The first person to run the setup records here the exact commands that worked and the files they generated (the
  Tailwind version and its Vite wiring, `components.json`, the `@/` alias, the CSS entry point). Until then, nobody
  can verify the preset from inside the repository
- Once applied, the generated CSS variables are the source of truth for the theme. Do not re-run
  `shadcn apply --preset` without asking: it overwrites the theme
- Generated shadcn components live in `src/components/ui/` and are not edited by hand
- The theme follows the system appearance, using the preset's light and dark palettes. There is no theme switch, so
  nothing about the theme is stored in the database
- Failures are reported with the preset's toast component. The functional specifications say when a toast is used
  rather than an inline message
- Homework text is Markdown, rendered with `react-markdown` and restricted to the inline subset defined in the
  functional specifications, using `allowedElements`. Raw HTML is never enabled: no `rehype-raw`, and no
  `dangerouslySetInnerHTML` anywhere in the code base. Rendering to React elements rather than to an HTML string is
  what makes user text unable to become live markup inside the webview, and it is why no separate sanitizer is needed
- Links inside homework text are opened in the system browser with `@tauri-apps/plugin-opener`, which is already a
  dependency. They must never navigate the application webview, which would unmount the application. Opening a link
  is a user action and does not contradict the offline rule: the application itself still never needs the network

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
- `lib/` — pure helpers (dates, grouping, SQL import and export), where most of the tests live

No state management library: React hooks plus a single context for the shared homework and course data. Do not add
Redux, Zustand, TanStack Query or a router without asking.
