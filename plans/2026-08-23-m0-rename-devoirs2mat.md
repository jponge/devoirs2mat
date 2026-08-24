Status: done

# Milestone 0 — Name the application Devoirs2mat

Part of [the roadmap](2026-08-23-roadmap.md). Nothing depends on this milestone, and it depends on nothing.

## Context

`specs/technical-stack.md` says the application is named **Devoirs2mat** everywhere and that the name is never
translated, naming four places explicitly: `productName` in `tauri.conf.json`, the window title, the `<title>` in
`index.html` (which "still carries the starter's *Tauri + React*"), and the installers.

None of that is true today: `homework/` is still the `create-tauri-app` starter and every one of those places says
`homework` or `Tauri + React`. This is the only point where the repository actively contradicts a spec rather than
simply not implementing it yet, and it is a five-minute fix, so it goes first.

## Scope decision, already taken

The rename is **user-visible only**. Deliberately left alone:

- the `homework/` directory — it is referenced by `CLAUDE.md` and by every spec
- the cargo package and lib names (`homework`, `homework_lib`) in `src-tauri/Cargo.toml`
- the bundle identifier `org.ponge.homework` in `tauri.conf.json`

The identifier is the important one: it determines the Tauri application data directory, which is where
`sqlite:homework.db` will live from milestone 3 onwards. Changing it later would orphan an existing database, and
changing it now buys nothing. Do not "tidy" any of these up as part of this milestone.

## Steps

1. `homework/src-tauri/tauri.conf.json`
   - `productName`: `"homework"` → `"Devoirs2mat"`
   - `app.windows[0].title`: `"homework"` → `"Devoirs2mat"`
   - leave `identifier`, `version` and everything under `build` and `bundle` untouched

2. `homework/index.html`
   - `<title>Tauri + React</title>` → `<title>Devoirs2mat</title>`
   - leave the `<link rel="icon" href="/vite.svg">` alone: `public/vite.svg` is removed in milestone 1, and the
     favicon is dealt with there rather than leaving a dangling reference here

3. `homework/README.md`
   - the heading is `# Homework`, describing the directory. Make it name the application: `# Devoirs2mat`, with a
     line noting that the application lives in this `homework/` directory. Keep the rest as it is — it is
     hand-written, not starter text
   - the root `README.md` is hand-written and does not mention the starter; leave it alone

4. No spec update is needed. This milestone makes the code match `specs/technical-stack.md`; it does not change what
   any spec says.

## Not in this milestone

- The installer names, which follow `productName` automatically. `pnpm tauri build` takes minutes and is explicitly
  not how work is checked, so the installers are not built to confirm this.
- Removing the starter (`App.css`, the three logos, the `greet` command). That belongs to milestone 1, where
  `App.jsx` is rewritten anyway.

## Definition of done

- `pnpm tauri dev` from `homework/` opens a window whose title bar reads **Devoirs2mat**
- no Rust was touched, so `cargo check` is not required — but it must still pass if run
- `pnpm test` does not exist yet (milestone 2). Say so; do not claim it passed
- state that the installer naming was not verified, and why
