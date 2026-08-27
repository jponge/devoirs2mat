#!/bin/bash
# Sets the release version across the three files that must agree: package.json,
# src-tauri/Cargo.toml and src-tauri/tauri.conf.json. Version format is
# year.month.day, unpadded (e.g. 2026.8.27) — see the "Versioning" subsection of
# specs/technical-stack.md.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "  version must be year.month.day, unpadded — e.g. 2026.8.27"
  exit 1
fi
if ! [[ "$VERSION" =~ ^[0-9]{4}\.[1-9][0-9]?\.[1-9][0-9]?$ ]]; then
  echo "INVALID_VERSION — expected year.month.day, unpadded (e.g. 2026.8.27), got: $VERSION"
  exit 1
fi

sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json

# Cargo.lock carries its own copy of the root package's version; `cargo check`
# refreshes it in place rather than erroring on the now-stale entry.
echo "--- syncing Cargo.lock ---"
(cd src-tauri && cargo check --quiet) || { echo "CARGO_CHECK_FAILED"; exit 2; }

echo "--- version set to $VERSION ---"
