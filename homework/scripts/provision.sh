#!/bin/bash
# One-time (and safe-to-repeat) setup for building Devoirs2mat installers on
# all three platforms from this Mac. Run this before any of the build-*.sh
# scripts. Idempotent: re-running it is always safe.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

if ! command -v mise >/dev/null 2>&1; then
  echo "MISE_NOT_FOUND — install Mise first: https://mise.jdx.dev/"
  exit 2
fi

echo "--- mise install (node, pnpm, rust, cargo-xwin) ---"
mise install || { echo "MISE_INSTALL_FAILED"; exit 3; }

# The Windows cross-target isn't something mise.toml can declare — Mise's
# `rust` tool wraps rustup underneath, but the target itself is rustup's own
# state, not a tracked Mise tool. `mise exec --` runs this inside Mise's
# environment so it finds the right rustup even if this shell hasn't sourced
# `mise activate`.
echo "--- rustup target add x86_64-pc-windows-msvc ---"
if ! mise exec -- rustup target add x86_64-pc-windows-msvc; then
  echo "RUSTUP_TARGET_FAILED — this is one of the unknowns cargo-xwin cross-compilation can hit on a fresh machine."
  echo "See the 'Distribution' section of specs/technical-stack.md for what to check."
  exit 4
fi

# Xcode's bundled clang/lld doesn't include the full LLVM binutils suite
# cargo-xwin needs to cross-link a Windows binary (specifically `llvm-lib`,
# the archiver) — found the hard way, not guessed in advance. This is the one
# piece of Windows-build provisioning that isn't Mise-managed: it's a system
# package via Homebrew, called out here rather than silently added. Homebrew
# does not symlink it onto PATH by default (it would conflict with Xcode's
# own clang), so build-windows.sh adds its bin directory to PATH itself,
# scoped to just that build.
echo "--- llvm (for llvm-lib, needed by cargo-xwin) ---"
if ! command -v brew >/dev/null 2>&1; then
  echo "HOMEBREW_NOT_FOUND — install Homebrew first, then 'brew install llvm', to build Windows installers."
elif [ -x "$(brew --prefix llvm 2>/dev/null)/bin/llvm-lib" ]; then
  echo "llvm: already installed at $(brew --prefix llvm)"
else
  brew install llvm || { echo "BREW_INSTALL_LLVM_FAILED"; exit 5; }
fi

# Tauri's NSIS bundler shells out to `makensis` to produce the actual
# installer — not bundled by Tauri itself, expected to already be on PATH.
# Also Homebrew, also called out rather than silently added.
echo "--- makensis (produces the NSIS installer) ---"
if command -v makensis >/dev/null 2>&1; then
  echo "makensis: $(makensis -VERSION 2>&1)"
elif command -v brew >/dev/null 2>&1; then
  brew install makensis || { echo "BREW_INSTALL_MAKENSIS_FAILED"; exit 5; }
else
  echo "HOMEBREW_NOT_FOUND — install Homebrew first, then 'brew install makensis', to build Windows installers."
fi

# Podman is a system container runtime, not something Mise manages the way it
# does node/rust — it's expected to already be installed (used for the Linux
# build, which needs a genuine Linux userspace, not a cross-compile). On
# macOS, podman itself is just a client: it also needs a Linux VM ("podman
# machine") actually running, which is not created on install.
echo "--- checking for podman (needed for scripts/build-linux.sh) ---"
if command -v podman >/dev/null 2>&1; then
  echo "podman: $(podman --version)"
  if ! podman machine list --format '{{.Running}}' 2>/dev/null | grep -q true; then
    echo "--- no podman machine running, starting one ---"
    if ! podman machine list --format '{{.Name}}' 2>/dev/null | grep -q .; then
      # Podman's own default (2GiB) OOM-kills partway through a release
      # build of this app's GTK/webkit2gtk bindings — found the hard way, not
      # guessed in advance. 8GiB is comfortable headway on a machine with
      # enough RAM to spare; adjust down if this is ever run somewhere tight.
      podman machine init --memory 8192 || { echo "PODMAN_MACHINE_INIT_FAILED"; exit 6; }
    fi
    podman machine start || { echo "PODMAN_MACHINE_START_FAILED"; exit 6; }
  fi
else
  echo "PODMAN_NOT_FOUND — install it if you intend to run scripts/build-linux.sh."
  echo "macOS and Windows builds do not need it."
fi

echo "--- ready ---"
echo "macOS:   ./scripts/build-macos.sh"
echo "Windows: ./scripts/build-windows.sh"
echo "Linux:   ./scripts/build-linux.sh (needs podman)"
