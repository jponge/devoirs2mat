Status: done

# Milestone 2 — Test tooling

Part of [the roadmap](2026-08-23-roadmap.md). Depends on milestone 1. Milestone 5 onwards cannot be test-driven until
this lands.

## Context

`CLAUDE.md` says a change is done when `pnpm test` passes, then concedes: *"Until the test tooling is bootstrapped,
`pnpm test` does not exist yet: say so rather than claiming it passed."* Every milestone so far has had to say exactly
that. This milestone removes the caveat.

`specs/technical-stack.md` already fixes the choices — `vitest` with `jsdom` and `@testing-library/react`, tests
colocated as `src/**/*.test.jsx`, `pnpm test` mapping to `vitest run` — so there is nothing to invent here. It also
records two traps that the milestone-1 review surfaced, both of which this milestone has to respect:

- the `test` block belongs in `vite.config.js`, **not** a standalone `vitest.config.js`, or the `@/` alias stops
  resolving in every test
- jsdom implements neither `window.matchMedia` nor `prefers-color-scheme`, and `src/main.jsx` must never be imported
  from a test

The point of this milestone is a real safety net, not a green tick. It is deliberately small: three test files over
code that already exists, and no new production code.

## Dependencies requiring approval

| package | why | alternative rejected |
|---|---|---|
| `vitest` | named by the technical stack; shares the Vite config and transform pipeline, so the `@/` alias and JSX work without a second build setup | Jest — would need its own transform and alias configuration, duplicating what Vite already does |
| `jsdom` | named by the technical stack; the DOM implementation vitest runs components against | `happy-dom` — faster, but not what the spec says, and its `matchMedia` differences would muddy exactly the code we are testing |
| `@testing-library/react` | named by the technical stack; renders components and queries them the way a user sees them | react-test-renderer / shallow rendering — tests implementation details rather than what the student sees |

**Deliberately not requested yet**, though the milestone-1 plan floated them:

- `@testing-library/jest-dom` — nicer matchers (`toBeInTheDocument`). Nothing in this milestone needs them, and
  plain assertions read fine at this size. Propose it when a test is actually made worse by its absence
- `@testing-library/user-event` — real interaction simulation. There is no interaction to simulate until milestone 9.
  Approve it there

That is three packages, all `devDependencies`, all named in the spec.

## Steps

### 1. Wire vitest into the existing Vite config

Add a `test` block to `homework/vite.config.js` — **not** a new `vitest.config.js`. The file is an async factory
(`defineConfig(async () => ({ ... }))`) and already registers `@tailwindcss/vite` and the `@/` alias; the `test` key
goes alongside `plugins`, `resolve` and `server`.

- `environment: "jsdom"`
- `setupFiles` pointing at a small `src/test-setup.js`
- do **not** enable `globals: true`. Import `describe`, `it`, `expect`, `vi` explicitly from `vitest`. This project
  has no TypeScript and therefore no ambient global types; explicit imports keep the source honest about where the
  names come from

`src/test-setup.js` registers React Testing Library's cleanup between tests, which does not happen automatically
when `globals` is off:

```js
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

### 2. Scripts

In `homework/package.json`:

- `"test": "vitest run"` — single shot. Never `vitest` bare, which watches and would hang an agent
- `"test:watch": "vitest"` — the interactive variant

### 3. The tests

Three files, covering what actually exists. Written test-first where that is meaningful — the behaviour is already
pinned down in `specs/technical-stack.md`, so nothing is being invented and frozen.

**`src/lib/theme.test.js`** — the only logic milestone 1 authored, and the reason it was extracted from `main.jsx`.
`startSystemThemeSync` takes `win` and `root` as arguments precisely so this works without a browser. Cases:

- a fake `win` reporting `matches: true` adds `dark` to the root's class list
- `matches: false` removes it
- firing the registered `change` listener with a new value flips the class — this is the regression that would
  actually happen in practice
- the returned function unsubscribes, and no further change affects the class
- a `win` with no `matchMedia` at all returns a no-op and throws nothing (jsdom's real behaviour, and an old webview's)
- a `MediaQueryList` exposing only the deprecated `addListener`/`removeListener` still works

**`src/App.test.jsx`** — the smoke test the roadmap asks for, and deliberately not a placeholder: render `App` and
assert the application name and the card content are present. This is what proves the whole chain — jsdom, the JSX
transform, the `@/` alias into `@/components/ui/*` — is genuinely wired.

**`src/theme-css.test.js`** — a cheap source guard over `src/index.css`, asserting the four `@import` lines and
`@custom-variant dark (&:is(.dark *))` are all still present. Deleting that one line silently kills every `dark:`
utility with no build error and no failing test anywhere else. Name the test so it is obvious it proves wiring, not
appearance.

Do **not** attempt to assert on computed colours: that needs a real browser, and the technical stack rules out
WebDriver. Light and dark rendering stays a human check, permanently.

### 4. Update the documents that say this does not exist

- `CLAUDE.md` — remove the "Until the test tooling is bootstrapped, `pnpm test` does not exist yet" sentence
- `specs/technical-stack.md` — drop "the test tooling" from the "What is not bootstrapped yet" list, and record the
  `globals`-off decision and the `test-setup.js` cleanup in the Testing section, since neither is guessable

## Verification

1. `pnpm test` from `homework/` — passes **and exits**. Confirm it terminates rather than watching; a hanging
   `pnpm test` is the specific failure this configuration exists to avoid
2. Deliberately break one assertion, confirm `pnpm test` fails and reports it, then restore it. A test suite that has
   never been seen to fail has not been verified
3. `pnpm build` still succeeds — the `test` block must not disturb the production build
4. The app still starts. Launch it, confirm the process is alive with no panic in the log, and kill it — do not
   leave a window open for a human to close. The session used a throwaway script for this; it lives outside the
   repository, so treat the *check* as the requirement, not the script
5. `cargo check` is not required: no Rust is touched

## Not in this milestone

- any production code beyond `src/test-setup.js`
- `@testing-library/jest-dom` and `@testing-library/user-event` (see above)
- coverage reporting, CI wiring, or a lint setup — `CLAUDE.md` says not to add a linter or formatter unasked
- any end-to-end or WebDriver setup, now or ever

## Definition of done

- `pnpm test` runs three test files, passes, and exits
- the suite has been observed failing when a test is broken
- `pnpm build` still passes and the app still starts
- `CLAUDE.md` and `specs/technical-stack.md` no longer claim the test tooling is missing
- what was not verified is stated plainly

---

## Outcome (recorded 2026-08-24)

Executed by a subagent, then reviewed by three subagents (architecture, quality engineering, adversarial). The suite
went from 14 tests to 23 in response to the reviews — the added ones are the ones that actually catch things.

### Fixed in response to the reviews

- **`pnpm test --watch` hung forever.** Vitest deliberately honours a trailing `--watch` even after `run`, so the one
  hard rule of this milestone had a hole in it. `"test": "vitest run --watch=false"` makes that invocation fail fast.
- **The media-query assertion was unfalsifiable.** `expect(win.matchMedia).toHaveBeenCalledWith(DARK_QUERY)` imported
  `DARK_QUERY` from the module under test, so inverting the query in `theme.js` — which would ship an app that is
  dark when the system is light — kept all 14 tests green. Proven, then fixed by pinning the literal.
- **The Tailwind exclusion was incomplete, and the first attempt at widening it made things worse.**
  `@source not "../**/*.{test,spec}.?(c|m)[jt]s?(x)"` silently matches nothing in Tailwind 4.3.3, which re-opened the
  leak. The working patterns are `./**/*.test.*`, `./**/*.spec.*` and `./test-setup.js`, each verified by probing a
  file, building, and grepping the bundle.
- **The theme wiring was only half-guarded.** Deleting `import "@/index.css"`, deleting the `startSystemThemeSync()`
  call, or deleting the entire pre-paint script from `index.html` all left the suite green. All three are now source
  guards, as are the `@source not` lines and the agreement between `index.html` and `theme.js` on the query string.
- **`applySystemTheme`'s two tests each started from the opposite state**, so a `toggle("dark")` ignoring its second
  argument passed both. Added the two cases that start from the state being asked for.
- **The production default parameters were untested.** `main.jsx` calls `startSystemThemeSync()` with no arguments;
  every test injected both. Added a case using a stubbed global.
- Config hardening the reviews argued for before milestone 3: `restoreMocks`, `unstubGlobals`, `unstubEnvs`, a
  fake-timer guard in `test-setup.js`, `TZ` pinned to `Europe/Paris`, and test discovery excluded from `src-tauri/`.
- Spec corrections: the `@vitest-environment node` docblock was justified by a **false cause** (jsdom does not break
  `import.meta.url`; Vite rewrites `new URL(rel, import.meta.url)` as an asset reference), the "first six lines of
  `index.css`" claim had already rotted, the `@source` lines were undocumented, and the pre-paint claim was written
  in the same confident voice as verified facts despite nobody having observed it.

### Verified

All seven mutations that previously survived are now killed: inverting the query, dropping the toggle's force
argument, dropping the stylesheet import, dropping the sync call, dropping the pre-paint script, dropping the
`@source` exclusions, and dropping `@custom-variant dark`. `pnpm test` passes in ~0.9s and exits 0; `pnpm build` and
`cargo check` pass; the built CSS is byte-identical to a build with no test files present.

**The light palette has now been seen.** A screenshot of the running application shows the window titled Devoirs2mat
rendering the preset's light theme correctly — the first time anyone has looked at this application.

### Not verified

The **dark** palette still has not been observed: the machine was in light appearance, and switching it is not
something an agent should do. The pre-paint script's effect (absence of a flash) remains unobservable by any
automated means. `@testing-library/jest-dom` and `@testing-library/user-event` remain deliberately uninstalled.
