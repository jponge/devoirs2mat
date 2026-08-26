Status: done

# Packaging scripts for macOS, Windows and Linux

Not a roadmap milestone — the twelve-milestone roadmap in `2026-08-23-roadmap.md` was already complete and
committed when this was requested. Julien wanted a smooth, scripted, repeatable way to produce an installer for
each of macOS, Windows and Linux from this Mac, leaning on Mise wherever Mise can actually manage the tool
involved, since he wants to hand a Windows build to his son and there was previously no packaged build for any
platform at all — only `pnpm tauri dev`.

## What shipped

- `mise.toml` (repo root): added `"cargo:cargo-xwin" = "latest"`.
- `homework/scripts/provision.sh` (new): idempotent toolchain setup — `mise install`, the
  `x86_64-pc-windows-msvc` Rust target, Homebrew `llvm` and `makensis` for the Windows build, a Podman machine
  (created with 8GiB memory if none exists) for the Linux build.
- `homework/scripts/build-macos.sh` (new): native build, produces a `.dmg`.
- `homework/scripts/build-windows.sh` (new): cross-compiled via `cargo-xwin`, produces an NSIS `.exe`.
- `homework/scripts/build-linux.sh` (new) and `homework/scripts/linux-build.Containerfile` (new): built natively
  inside a Podman container running Ubuntu 24.04, produces an AppImage.
- `specs/technical-stack.md`: a new "Distribution" section documents all of it, including every real problem hit
  and fixed along the way (below) — not just the intended design.
- `homework/README.md`: points at the scripts alongside the existing `pnpm tauri dev` line.

All three were verified by actually producing an artifact and checking it with `file` (a genuine `.dmg`, a genuine
PE32+ `.exe`, a genuine ELF `.AppImage`), then re-running all three back to back to confirm nothing about one
build leaves the next one broken. `pnpm test` stayed at 411/411 throughout — no application code changed.

## What this plan got right vs. what only showed up by actually running it

The original approach (mise for everything possible, `cargo-xwin` for Windows, a Podman container for Linux,
`--bundles <format>` to keep each script's output to one clear artifact) held up. But six real, non-obvious
problems only surfaced by actually building each target, not by reasoning about it in advance — each is explained
in full in `specs/technical-stack.md`'s new Distribution section, summarized here:

1. Mise's `cargo:`-installed tools aren't on the ambient `PATH` the way core tools are — `cargo-xwin` needed
   `mise exec --` wrapping the actual build command, not just the preflight checks.
2. This Mac's case-sensitive APFS breaks the Windows SDK headers cargo-xwin downloads, which reference each other
   with inconsistent case (`windows.h` vs `Windows.h`, and more) — fixed with a mounted case-insensitive disk
   image for cargo-xwin's cache, not one-off symlinks.
3. Xcode's toolchain is missing `llvm-lib` (needed to cross-link) and Tauri's NSIS bundler needs `makensis`,
   neither Mise-managed — both via Homebrew, called out rather than silently added.
4. Podman's default VM memory (2GiB) OOM-kills mid-build on this app's GTK bindings — needs 8GiB.
5. The AppImage bundler is itself an AppImage needing FUSE, unavailable in a container — needs
   `APPIMAGE_EXTRACT_AND_RUN=1`.
6. Bind-mounted build output breaks the AppImage bundler's file-copy step (a virtiofs quirk) and rootless Podman's
   user-namespace mapping isn't stable enough across separate `podman run` invocations for a fresh container to
   clean up an earlier one's files — needed a named volume for build output plus `podman machine ssh -- sudo rm -rf`
   for cleanup between runs, not a bare `rm -rf`.
7. `node_modules` gets fought over between platforms (native binaries differ) — every `pnpm install` in every
   script now runs with `CI=true`.

## Known limitation, not resolved here

The Linux AppImage is built for `aarch64` (ARM64), matching this Apple Silicon Mac's own architecture — Podman's
Linux VM runs natively, not emulated. Most physical Linux desktop/laptop hardware is `x86_64`; this artifact will
not run there. Unlike the Windows build (a specific, named deployment target — Julien's son), no Linux machine has
been named yet, so this was left as a known limitation rather than guessed at. Producing an `x86_64` build would
mean either QEMU-emulated in-container compilation (slow) or a second, `x86_64`-architecture Podman machine —
worth deciding once there is an actual Linux target, not before.
