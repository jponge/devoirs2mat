Status: done

# Release build tuning: Cargo release profile and Vite build target

Two build-configuration changes, agreed with Julien after investigating why the Windows installer felt more
sluggish than the macOS one at cold start. The dominant suspect there is that the Windows binary is unsigned
(Defender/SmartScreen reputation checks add real delay to an unsigned, unrecognized `.exe`, and a personal app
never builds enough install-base reputation to get past that automatically) — code signing is a separate
cost/process decision, not part of this plan. These two changes are the free, always-beneficial part: neither
closes the signing gap, but both make every platform's binary leaner and faster to start regardless.

This plan is self-contained: an agent starting cold should need only this file, `specs/technical-stack.md`'s
"Distribution" section, and `CLAUDE.md`. No design discussion is needed — both changes are small, mechanical
config edits with well-defined values.

## Where this starts from

- `homework/src-tauri/Cargo.toml` has no `[profile.release]` section at all today — every installer (macOS `.dmg`,
  Windows `.exe` via `build-windows.sh`, Linux AppImage via `build-linux.sh`) ships with Cargo's untuned release
  defaults: `codegen-units = 16`, no LTO, no symbol stripping.
- `homework/vite.config.js` sets no `build.target` — Vite/esbuild falls back to its own conservative default,
  which can retain transpilation/polyfills the app doesn't need, since Tauri's webview is a fixed, modern engine
  (WebView2 on Windows, WKWebView on macOS/Linux), not the general web.
- `specs/technical-stack.md`'s "Distribution" section, `### All three` subsection (near the end, just before
  "## Code layout under `homework/src`"), is where build behavior common to every platform is documented today —
  see the existing `CI=true` / `pnpm install` note there for the pattern to follow.
- Confirmed by reading `tauri-utils-2.9.3/src/config.rs` (the crate backing `tauri.conf.json` parsing, vendored
  under `~/.cargo/registry/src/.../tauri-utils-2.9.3/`) that `TAURI_ENV_PLATFORM` is a real environment variable
  Tauri sets around `beforeDevCommand`/`beforeBuildCommand` — i.e. exactly when `pnpm dev`/`pnpm build` run as
  Vite's entry points via `pnpm tauri dev`/`pnpm tauri build`. This is not a guess.

## Decisions

1. **Cargo profile**: add to `homework/src-tauri/Cargo.toml`:
   ```toml
   [profile.release]
   lto = "thin"
   codegen-units = 1
   strip = true
   ```
   `lto = "thin"`, not `true` (fat LTO) — fat LTO is marginally smaller/faster but noticeably slower to compile,
   and the Windows cross-build and Linux Podman build are already the slow part of releasing; thin LTO is the
   sweet spot Cargo's own docs recommend for this tradeoff. `strip = true` drops the symbol table (smaller binary,
   faster for Defender/Gatekeeper to scan and for the OS to load) without changing runtime behavior — panic
   messages still print, only symbolized backtraces are lost, which nobody was relying on since this app ships no
   debugger to end users.

2. **Vite build target**: add to `homework/vite.config.js`'s returned config object:
   ```js
   build: {
     target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
   },
   ```
   These exact values are Tauri's own documented recommendation for Vite frontends (not chosen freehand) — a
   conservative floor matching the oldest WebView2/WKWebView versions Tauri itself targets, letting esbuild skip
   transpilation/polyfills for anything newer than that floor.

## Not in this milestone

- **Code signing.** The actual fix for the Windows SmartScreen/Defender cold-start delay. Needs a certificate
  (EV or OV, an ongoing cost, possibly a hardware token) — a decision for Julien, raised separately, not bundled
  into a build-tuning change.
- **Fat LTO (`lto = true`).** Rejected in decision 1 for build-time cost; revisit only if thin LTO's binary size
  turns out to be a real problem, not preemptively.
- **`panic = "abort"`.** Not part of this plan. It would also shrink the binary, but it changes behavior, not just
  performance: Tokio relies on unwinding to isolate a panicking async task from crashing the whole process, and
  this app runs async `sqlx`/`tauri-plugin-sql` work on Tokio. Setting `panic = "abort"` would turn an isolated
  task panic into a full process crash. Out of scope here; would need its own review if ever proposed.
- **JS code-splitting / `manualChunks`.** Investigated and ruled out already: the heaviest deps (`react-markdown`,
  `react-day-picker`) are used in `course-group.jsx` and `date-navigator.jsx`, both on the always-visible main
  screen of this single-window, routeless app. There is no lazy corner to defer them to — splitting wouldn't defer
  any real work.

## Dependencies

None. No new Mise tool, pnpm package or cargo crate — both changes are config-only.

## Steps

### 1. `homework/src-tauri/Cargo.toml`

Add the `[profile.release]` section from decision 1. Placement: after `[package]` and before `[lib]`, as its own
top-level table (Cargo profile tables are conventionally grouped near the top of the manifest).

Verify with `cargo build --release` (from `homework/src-tauri/`) — not `cargo check`, since profile flags like LTO
and stripping only take effect during actual codegen/linking, which `cargo check` skips. Compare the resulting
binary's size against a build from `main` before this change (`ls -lh target/release/homework` or equivalent) as a
sanity check that stripping/LTO actually took effect — expect a meaningfully smaller binary, not a precise target
number. Then run `cargo test` (from `homework/src-tauri/`) to confirm nothing about the profile change broke
anything — it shouldn't, since no code changes, but confirm rather than assume.

### 2. `homework/vite.config.js`

Add the `build.target` line from decision 2 to the config object returned by `defineConfig`, alongside the
existing `plugins`, `resolve`, `test` and `server` keys.

Verify two ways:
- `pnpm build` succeeds cleanly (this exercises the `safari13` branch, since `TAURI_ENV_PLATFORM` is unset outside
  a `tauri dev`/`tauri build` invocation) — confirm the build output still works by loading it (`pnpm preview` or
  `pnpm tauri dev`).
- Confirm `TAURI_ENV_PLATFORM` is actually populated as expected when driven through Tauri: temporarily add
  `console.log(process.env.TAURI_ENV_PLATFORM)` at the top of `vite.config.js`, run `pnpm tauri dev`, and confirm
  the terminal prints something other than `undefined` — proving the ternary really does select a platform-specific
  target during a real Tauri-driven build, not just falling through to the `safari13` default by accident. Remove
  the temporary `console.log` afterward; it is not part of the shipped change. (Actually run on this machine: the
  value was `darwin`, not `macos` — Tauri derives it from the Rust target triple's OS component, e.g.
  `aarch64-apple-darwin`, not from `std::env::consts::OS`. Doesn't change decision 2's logic, which only branches on
  `=== "windows"` and otherwise falls through to `safari13` — correct for both `darwin` and `linux`, since both
  macOS's WKWebView and Linux's WebKitGTK are WebKit-family, unlike Windows' Chromium-based WebView2.)

### 3. `specs/technical-stack.md`

Add a short paragraph to the `### All three` subsection (end of "Distribution"), after the existing `CI=true`
paragraph, documenting both changes: the `[profile.release]` tuning and why (`thin` LTO, `codegen-units = 1`,
`strip = true`, and explicitly that `panic = "abort"` was considered and rejected for its Tokio-unwinding
implications), and the Vite `build.target` ternary with a one-line note that the exact values come from Tauri's own
documented Vite guidance, not chosen freehand.

## Definition of done

- `cargo build --release` succeeds from `homework/src-tauri/`, and the resulting binary is visibly smaller than
  before the profile change.
- `cargo test` passes (from `homework/src-tauri/`).
- `pnpm test` passes.
- `pnpm build` succeeds.
- `pnpm tauri dev` starts, and the temporary `TAURI_ENV_PLATFORM` log (added only for verification) confirmed
  `macos` before being removed.
- `specs/technical-stack.md` updated in the same change, per CLAUDE.md's rule that code and specs must not diverge
  silently.
- State plainly what was not verified: this plan does not produce or test an actual Windows installer, so the real
  cold-start improvement on Windows (the original motivation) is not measured here — only that the mechanism
  (smaller/stripped binary, narrower JS transpile target) is correctly wired up. Confirming it actually feels
  faster on Windows needs a real Windows test, separate from this change.

## Known traps

- **`cargo check` will not catch a mistake in the `[profile.release]` values** — it never invokes the release
  profile's codegen/linking path. Only `cargo build --release` (or a real `tauri build`) exercises it.
- **`TAURI_ENV_PLATFORM` is only set when Vite runs as a hook of `tauri dev`/`tauri build`.** A bare `pnpm dev` or
  `pnpm build` (outside `pnpm tauri dev`/`pnpm tauri build`) will always take the `safari13` branch of the ternary,
  which is expected, not a bug — `pnpm dev`/`pnpm build` alone were never the way this app is actually shipped or
  even meaningfully run (per `CLAUDE.md`: "every Tauri API call fails there").
