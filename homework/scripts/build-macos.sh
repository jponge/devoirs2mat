#!/bin/bash
# Builds the macOS installer: a .dmg, the standard drag-to-Applications
# handoff. Native build, no cross-compilation involved. Run
# scripts/provision.sh first if this is a fresh machine.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

# CI=true: switching between this and build-linux.sh leaves node_modules
# holding the other platform's native binaries; pnpm otherwise refuses to
# reinstall over that without an interactive confirmation.
CI=true pnpm install || { echo "PNPM_INSTALL_FAILED"; exit 2; }

echo "--- pnpm tauri build --bundles dmg ---"
pnpm tauri build --bundles dmg || { echo "BUILD_FAILED"; exit 3; }

DMG=$(find src-tauri/target/release/bundle/dmg -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null)
if [ -z "$DMG" ]; then
  echo "BUILD_SUCCEEDED_BUT_DMG_NOT_FOUND — check src-tauri/target/release/bundle/dmg/"
  exit 4
fi
echo "--- done ---"
echo "$SP/$DMG"
