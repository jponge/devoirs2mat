# Devoirs

The Tauri 2 + React desktop application. It lives in this `homework/` directory.

Run it with `pnpm install` then `pnpm tauri dev`, from this directory. `pnpm test` runs the test suite.

`./scripts/dev-probe.sh` launches the application, reports its window title, saves a screenshot, and then shuts it
down again — so an automated check never leaves a window open for a human to close.

To build an installer, run `./scripts/provision.sh` once (sets up the toolchain via Mise, safe to re-run), then
whichever of `./scripts/build-macos.sh`, `./scripts/build-windows.sh` or `./scripts/build-linux.sh` matches the
platform you're building for — Windows and Linux are cross-built from macOS (see the Distribution section of
[`../specs/technical-stack.md`](../specs/technical-stack.md) for how). Each prints the path to the resulting
installer when it's done.

See [`../specs/`](../specs/) for the technical stack, the functional specifications and the design guidelines, and
[`../CLAUDE.md`](../CLAUDE.md) for the working conventions.
