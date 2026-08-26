#!/bin/bash
# Builds the Linux installer: an AppImage, built inside a Podman container
# running Ubuntu — a genuine Linux userspace, since webkit2gtk/GTK can't be
# cross-compiled from macOS the way cargo-xwin handles Windows. Needs Podman
# (scripts/provision.sh checks for it, but does not install it).
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPTS/../.." && pwd)"
IMAGE="devoirs2mat-linux-build"
VOLUME="devoirs2mat-linux-target"
CONTAINER="devoirs2mat-linux-build-run"
OUT="$SCRIPTS/../src-tauri/target/podman-linux-appimage"

if ! command -v podman >/dev/null 2>&1; then
  echo "PODMAN_NOT_FOUND — install it, or ask scripts/provision.sh to check for it."
  exit 2
fi

echo "--- podman build ---"
podman build -t "$IMAGE" -f "$SCRIPTS/linux-build.Containerfile" "$SCRIPTS" \
  || { echo "IMAGE_BUILD_FAILED"; exit 3; }

podman volume create "$VOLUME" >/dev/null 2>&1
podman rm -f "$CONTAINER" >/dev/null 2>&1

# The bundler doesn't reliably re-run against its own previous output still
# sitting in the volume from an earlier build (found the hard way: a second
# consecutive run failed with a plain "Permission denied" partway through
# bundling). Rootless Podman's per-container user-namespace mapping isn't
# guaranteed stable enough across separate `podman run` invocations for a
# plain `rm -rf` from inside a fresh container to reliably delete files a
# previous container wrote — also found the hard way, the in-container `rm`
# this used before this comment itself failed with "Permission denied" on
# the very directories it was trying to remove. `podman unshare` would be
# the normal fix but isn't available talking to a remote machine (macOS
# podman always is one); `podman machine ssh -- sudo rm -rf` reaches real
# root inside the VM instead, which bypasses the mapping question entirely.
# `deps/`/`incremental/` (the expensive part to rebuild) live in a sibling
# directory and are untouched.
MOUNTPOINT=$(podman volume inspect "$VOLUME" --format '{{.Mountpoint}}' 2>/dev/null)
if [ -n "$MOUNTPOINT" ]; then
  podman machine ssh -- sudo rm -rf "$MOUNTPOINT/release/bundle" 2>/dev/null
fi

echo "--- podman run (mise install, pnpm install, tauri build --bundles appimage) ---"
# The whole repo is bind-mounted at /workspace for the source: mise.toml
# lives at the repo root, and mise's config discovery walks up parent
# directories to find it — the same reason a bare `pnpm`/`cargo` already
# works from homework/ locally with no mise.toml of its own there.
#
# The BUILD OUTPUT, on the other hand, is deliberately NOT on that bind
# mount: CARGO_TARGET_DIR points at a named Podman volume instead (native to
# the Linux VM's own filesystem, unlike a bind mount which is proxied from
# macOS). Found the hard way: the AppImage bundler copies and re-permissions
# a few hundred shared libraries into place, and that specific pattern of
# file operations fails with "Permission denied" on the bind-mounted path
# (a virtiofs quirk, not a real permission problem — the very same build
# writes thousands of ordinary object files there just fine during
# compilation). The volume avoids that entirely, and survives across runs
# for the same caching benefit a bind-mounted target dir would have given.
# `podman cp` retrieves just the final artifact afterward.
#
# CI=true: pnpm refuses to touch a `node_modules` it didn't create (the one
# already there from a macOS build, since that directory IS on the bind
# mount) without an interactive confirmation — there is no TTY in a
# container, so this is the documented way to say yes.
#
# APPIMAGE_EXTRACT_AND_RUN=1: the bundler's own tooling (linuxdeploy) is
# itself shipped as an AppImage, which normally mounts itself via FUSE —
# not available in an ordinary container. This tells it to extract and run
# directly instead, which needs no FUSE device.
podman run --name "$CONTAINER" \
  -v "$ROOT:/workspace" \
  -v "$VOLUME:/build-target" \
  -w /workspace/homework \
  -e CI=true \
  -e CARGO_TARGET_DIR=/build-target \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  "$IMAGE" \
  bash -c "mise trust -a && mise install && pnpm install && pnpm tauri build --bundles appimage"
BUILD_STATUS=$?

mkdir -p "$OUT"
podman cp "$CONTAINER:/build-target/release/bundle/appimage/." "$OUT/" 2>/dev/null
podman rm -f "$CONTAINER" >/dev/null 2>&1
# Only the final artifact is worth keeping — `Devoirs2mat.AppDir` alongside
# it is linuxdeploy's staging directory, not something to hand anyone.
rm -rf "$OUT"/*.AppDir

if [ "$BUILD_STATUS" -ne 0 ]; then
  echo "BUILD_FAILED"
  exit 4
fi

APPIMAGE=$(find "$OUT" -maxdepth 1 -name '*.AppImage' -print -quit 2>/dev/null)
if [ -z "$APPIMAGE" ]; then
  echo "BUILD_SUCCEEDED_BUT_APPIMAGE_NOT_FOUND — check $OUT/"
  exit 5
fi
echo "--- done ---"
echo "$APPIMAGE"
