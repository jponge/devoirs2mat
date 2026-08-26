#!/bin/bash
# Builds the Windows installer: an NSIS .exe, cross-compiled from macOS via
# cargo-xwin. Run scripts/provision.sh first — this needs the
# x86_64-pc-windows-msvc rust target and the cargo-xwin tool it installs.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

if ! mise exec -- rustup target list --installed 2>/dev/null | grep -q '^x86_64-pc-windows-msvc$'; then
  echo "WINDOWS_TARGET_MISSING — run ./scripts/provision.sh first."
  exit 2
fi
if ! mise exec -- cargo xwin --version >/dev/null 2>&1; then
  echo "CARGO_XWIN_MISSING — run ./scripts/provision.sh first (or 'mise install')."
  exit 2
fi

# The Windows SDK headers cargo-xwin downloads reference each other with
# inconsistent case — `sqlite3.c` includes "windows.h", the SDK ships
# `Windows.h`; that header includes "DriverSpecs.h", the SDK ships
# `driverspecs.h`; and so on with no reason to expect that list is
# exhaustive. Harmless on Windows' own case-insensitive filesystem, fatal on
# this Mac's case-sensitive APFS (confirmed the hard way, one header at a
# time, before concluding it needed a general fix rather than one-off
# symlinks). The general fix: give the cache its own case-insensitive
# volume, so every header resolves regardless of which case anything
# references it with.
XWIN_CACHE="$HOME/Library/Caches/cargo-xwin"
XWIN_IMAGE="$HOME/Library/Caches/cargo-xwin-case-insensitive.sparseimage"
if ! mount | grep -q " on $XWIN_CACHE "; then
  echo "--- mounting a case-insensitive volume for the xwin cache ---"
  mkdir -p "$HOME/Library/Caches"
  if [ ! -f "$XWIN_IMAGE" ]; then
    # Plain "APFS" (not "Case-sensitive APFS") is the case-insensitive
    # variant — hdiutil has no separately-named "case-insensitive" option
    # because that's APFS's own default.
    hdiutil create -size 4g -fs "APFS" -volname CargoXwinCache -type SPARSE "$XWIN_IMAGE" -quiet \
      || { echo "XWIN_IMAGE_CREATE_FAILED"; exit 6; }
  fi
  rm -rf "$XWIN_CACHE"
  mkdir -p "$XWIN_CACHE"
  hdiutil attach "$XWIN_IMAGE" -mountpoint "$XWIN_CACHE" -quiet \
    || { echo "XWIN_IMAGE_MOUNT_FAILED"; exit 6; }
fi

# CI=true: switching between this and build-macos.sh/build-linux.sh leaves
# node_modules holding another platform's native binaries; pnpm otherwise
# refuses to reinstall over that without an interactive confirmation.
CI=true pnpm install || { echo "PNPM_INSTALL_FAILED"; exit 3; }

# Homebrew's llvm is deliberately not on PATH globally (it would conflict
# with Xcode's own clang) — scoped to just this build, which needs its
# `llvm-lib` archiver to cross-link a Windows binary.
if command -v brew >/dev/null 2>&1 && [ -d "$(brew --prefix llvm 2>/dev/null)/bin" ]; then
  export PATH="$(brew --prefix llvm)/bin:$PATH"
fi

echo "--- pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis ---"
# First run downloads the Windows SDK/CRT headers cargo-xwin needs — about a
# gigabyte, one-time, cached afterward (in the case-insensitive volume
# mounted above).
#
# `mise exec --` here, not a bare `pnpm`: `cargo-xwin` is installed via mise's
# `cargo:` backend, which shims it rather than adding it to a PATH directory
# tauri build's own subprocess would otherwise see — confirmed the hard way,
# a bare `pnpm tauri build --runner cargo-xwin` fails with `cargo-xwin`
# command not found even right after a successful `mise install`.
mise exec -- pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis \
  || { echo "BUILD_FAILED"; exit 4; }

EXE=$(find src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -maxdepth 1 -name '*.exe' -print -quit 2>/dev/null)
if [ -z "$EXE" ]; then
  echo "BUILD_SUCCEEDED_BUT_EXE_NOT_FOUND — check src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"
  exit 5
fi
echo "--- done ---"
echo "$SP/$EXE"
