#!/bin/bash
# Removes build outputs: the Vite frontend bundle and the Cargo target
# directory. The latter covers every platform's installer produced by
# build-macos.sh, build-windows.sh and build-linux.sh (the Windows build
# lands under target/x86_64-pc-windows-msvc/, the Linux AppImage under
# target/podman-linux-appimage/). Safe to re-run: rm -rf is a no-op on a
# path that's already gone.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

for path in dist src-tauri/target; do
  echo "--- removing $path ---"
  rm -rf "$path"
done

echo "--- done ---"
