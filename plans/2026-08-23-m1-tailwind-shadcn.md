Status: approved

# Milestone 1 — Tailwind CSS and the shadcn preset

Part of [the roadmap](2026-08-23-roadmap.md). Depends on milestone 0 (done). Every later visual milestone depends on
this one.

## Context

`specs/technical-stack.md` requires the user interface to be built from shadcn components using the preset
`b7W7uXIq8`, and shadcn requires Tailwind CSS. Neither is installed: `homework/` has no `components.json`, no
`jsconfig.json`, no Tailwind config, and no CSS entry point beyond the starter's `src/App.css`.

That spec also carries a promissory note it is this milestone's job to discharge:

> The first person to run the setup records here the exact commands that worked and the files they generated (the
> Tailwind version and its Vite wiring, `components.json`, the `@/` alias, the CSS entry point). Until then, nobody
> can verify the preset from inside the repository.

So this milestone is not done when the styling works — it is done when the next person can reproduce it from the spec.

The technical stack is explicit that this must be its own dedicated change and not a side effect of a feature, which
is why no application behaviour is built here. The deliverable is a styled shell and a truthful spec.

## Environment as measured on 2026-08-23

| | |
|---|---|
| node | v26.7.0 |
| pnpm | 11.21.0 |
| react / react-dom | 19.2.8 |
| vite | 7.3.6 |
| @vitejs/plugin-react | 4.7.0 |
| @tauri-apps/cli | 2.11.4 |
| tsconfig.json | absent — shadcn should infer JavaScript from this |

## Dependencies requiring approval before anything is installed

Per `CLAUDE.md`, each with a justification and the alternative rejected. **Do not install any of these until Julien
has approved this plan.**

| package | why | alternative rejected |
|---|---|---|
| `tailwindcss` | shadcn cannot work without it; the technical stack mandates shadcn | hand-written CSS or CSS modules — would put us off the shadcn path the spec requires |
| `@tailwindcss/vite` | the official Tailwind v4 Vite plugin, one line in `vite.config.js` | the PostCSS pipeline (`@tailwindcss/postcss` + a `postcss.config.js`) — more moving parts for an identical result under Vite |
| `class-variance-authority`, `clsx`, `tailwind-merge` | pulled in by `shadcn init`; every generated component imports the `cn()` helper built from them | none — they are not optional if we use shadcn |
| `tw-animate-css` | Tailwind v4 shadcn uses it for component animations, and the design guidelines ask for subtle animation | `tailwindcss-animate`, which is the Tailwind v3 predecessor and not what v4 shadcn generates |
| `lucide-react` | shadcn's icon set; icons are bundled, satisfying the no-network-at-runtime rule | an icon font or hand-rolled SVGs — more work, and it is what the generated components import |
| `@radix-ui/react-slot` | the only Radix package the two components added here (`button`, `card`) need | none — it is a transitive requirement of the generated component |

The shadcn CLI itself is **not** a dependency: it runs through `pnpm dlx`. Radix packages for later components
(drawer, toast, select, dialog…) are approved in the milestone that first needs them, not here.

Report the exact resolved versions back to Julien after installing, since this plan can only name the packages.

## Steps

### 1. Initialise shadcn

```
cd homework
pnpm dlx shadcn@latest init
```

**Hazard: this command prompts, and an interactive prompt hangs an agent.** Run it with a timeout and inspect the
output rather than letting it block. If it needs flags to run unattended, use them (`--yes` and friends) and record
in the spec exactly which invocation worked — that is precisely the kind of thing the spec is asking to be written
down.

Then assert, before going further:

- `components.json` exists and contains `"tsx": false`. If it says `true`, stop, fix it, and note it: the spec
  forbids TypeScript in this project and a wrong answer here poisons every component generated afterwards
- no `tsconfig.json` was created

### 2. Apply the preset

```
pnpm dlx shadcn@latest apply --preset b7W7uXIq8
```

**Run this exactly once.** The spec forbids re-running it without asking, because it overwrites the theme.

If the `apply` subcommand does not exist in the current CLI, or the preset id does not resolve, **stop and ask**.
Do not substitute a different theme, do not hand-write a palette, and do not fall back to shadcn's default base
colour — the preset *is* the design specification, and inventing one would silently diverge from
`specs/design-guidelines.md`.

### 3. Wire the build

- `vite.config.js` — add the Tailwind plugin to the existing `plugins: [react()]` array, and add the `@/` alias.
  Note this file is ESM and uses `defineConfig(async () => ({ ... }))`: `__dirname` does not exist here, so the
  alias must be built with `fileURLToPath(new URL("./src", import.meta.url))`. Getting this wrong fails at import
  time with a confusing message
- `jsconfig.json` — new file, `compilerOptions.baseUrl` and `paths` mapping `@/*` to `./src/*`, so the editor
  resolves the alias too. Not a `tsconfig.json`
- the CSS entry point (whatever `init` generated, typically `src/index.css`) imported once from `src/main.jsx`
- leave the Vite dev-server block (port 1420, `strictPort`, the `src-tauri` watch ignore) untouched — Tauri depends
  on it

### 4. Remove the starter

- delete `src/App.css`, `src/assets/react.svg`, `public/vite.svg`, `public/tauri.svg`
- `homework/index.html` — remove the `<link rel="icon" type="image/svg+xml" href="/vite.svg" />` line, which
  milestone 0 deliberately left alone and which now points at a deleted file. A desktop webview shows no favicon, and
  the no-network-at-runtime rule rules out a remote one
- `src-tauri/src/lib.rs` — delete the `greet` command and its `.invoke_handler(tauri::generate_handler![greet])`
  line. Keep the `tauri_plugin_opener` registration: the technical stack says the opener is used for links in
  homework text
- `src/App.jsx` — replace with a minimal shell: the application name, and enough shadcn surface (a `card` and a
  `button`, added with `pnpm dlx shadcn@latest add card button`) to make both palettes visibly exercised. No
  application behaviour, no date logic, no database — those are later milestones

### 5. Discharge the spec's promissory note

Rewrite the placeholder paragraph in `specs/technical-stack.md` under "User interface" with what actually happened:

- the exact `init` and `apply` invocations that worked, including any flags needed to run unattended
- the resolved Tailwind version, and the fact that wiring is via `@tailwindcss/vite` in `vite.config.js` rather than
  a PostCSS config
- the generated files and their locations: `components.json` (with `"tsx": false`), the CSS entry point, `src/lib/utils.js`
- how the `@/` alias is configured, in both `vite.config.js` and `jsconfig.json`
- the packages the CLI added, with versions

If anything else in that spec turns out to be wrong once the CLI has run, fix it in this same change. Code and specs
must never diverge silently.

## Verification

1. `pnpm build` from `homework/` — the frontend bundle must succeed. This is the strongest non-GUI check available:
   it proves Tailwind compiles and that the `@/` alias resolves in a real build
2. `cargo check` from `homework/src-tauri/` — `lib.rs` was touched
3. Launch the app, confirm the process is alive with no panic in the log, and kill
   it without leaving a window to close
4. Grep the generated CSS to confirm the preset produced **both** a light and a dark set of variables, and that the
   dark set is behind `prefers-color-scheme` or a `.dark` selector — the theme follows the system appearance and
   there is no in-application switch
5. `pnpm test` does not exist until milestone 2. Say so; do not claim it passed

### Known verification gap

The definition of done for this milestone is visual, and this environment currently has neither Accessibility nor
Screen Recording permission, so the agent **cannot see the rendered window** — only confirm the process runs. Step 4
checks that the palettes exist in the CSS, which is not the same as seeing them applied.

Either grant those permissions before this milestone runs, or expect to eyeball the light and dark appearance
yourself and confirm. Do not let an agent claim the palettes render correctly on the strength of a grep.

## Not in this milestone

- any shadcn component beyond `card` and `button` — each is approved by the milestone that needs it
- the test tooling (milestone 2), so no test is written here
- any application behaviour, date logic, database or i18n

## Definition of done

- `pnpm build` and `cargo check` pass
- the shell renders through the preset, with the light and dark palettes confirmed by a human
- `components.json` says `"tsx": false` and no TypeScript entered the project
- `specs/technical-stack.md` records the real commands and generated files, so the setup is reproducible from the
  repository alone
- what was not verified is stated plainly

---

## Outcome (recorded 2026-08-24)

Executed by a subagent, then reviewed by three subagents (architecture, quality engineering, adversarial).

### Deviations from the approved plan

- **Step order reversed.** The shadcn CLI refuses to `init` on a Vite project until Tailwind *and* an import alias
  already exist, failing with `No Tailwind CSS configuration found` / `Could not find valid path aliases`. So plan
  step 3 (wiring) had to run before plan step 1 (init). Recorded in `specs/technical-stack.md`.
- **Three dependencies landed that the approval table did not name**, all CLI-driven rather than chosen:
  `radix-ui` (the umbrella, instead of the planned `@radix-ui/react-slot`), `shadcn` itself as a *runtime*
  dependency, and `@fontsource-variable/inter`. These need Julien's retroactive ratification — see the open
  decisions below.
- **The preset was verified, not assumed.** `preset decode b7W7uXIq8` reports style `luma` / baseColor `taupe`, and
  the adversarial review reproduced the whole recipe from `git archive HEAD` and got byte-identical output. `init`
  alone leaves a desaturated grey palette; it is `apply` that writes taupe. No theme was invented.

### Fixed in response to the reviews

- The system-theme mirror was extracted from `src/main.jsx` to `src/lib/theme.js`, with `win` and `root` injectable,
  because jsdom implements neither `matchMedia` nor the media query — as written it made the only logic this
  milestone authored untestable in milestone 2.
- It is now started *after* the first render, and degrades to a no-op rather than throwing: an older WebKit without
  `MediaQueryList.addEventListener` previously meant a blank window, not just a theme that fails to follow.
- An inline pre-paint script in `index.html` applies `.dark` before the render-blocking stylesheet, fixing a white
  flash on every cold start on a dark system. Verified in the built `dist/index.html`.
- Several spec corrections: the theme is split across `src/index.css` and `shadcn/tailwind.css` (so `pnpm update` can
  change it with no diff under `src/`); `@custom-variant dark` is load-bearing; the CLI infers JavaScript from the
  *absence* of `tsconfig.json` and has no flag for it; pin `shadcn@4.19.0` to reproduce; `jsconfig.json` shown in
  full; `hooks/` added to the code layout; the vitest alias and `matchMedia` traps recorded for milestone 2; and the
  "no new Radix dependency" claim softened, because `sonner` and `react-day-picker` will still be needed.

### Open decisions for Julien

1. Ratify or reject the three unplanned dependencies.
2. `shadcn` is `^4.19.0` in `dependencies` while being build-time-only. Pin it exactly and move it to
   `devDependencies`, or run `pnpm dlx shadcn@latest eject` to inline `shadcn/tailwind.css` and drop it entirely?
   Ejecting is cheapest now, against two components, rather than after milestone 6 adds several more.
3. `"csp": null` in `tauri.conf.json` leaves the offline rule audited rather than enforced. It matters once
   user-authored Markdown lands in milestone 8.

### Not verified

The rendered window has not been seen in either palette. This environment has neither Accessibility nor Screen
Recording permission, so the light/dark check remains a human eyeball, as the plan's "Known verification gap" said.
`pnpm test` does not exist until milestone 2.
