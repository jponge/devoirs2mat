#!/usr/bin/env bash
set -euo pipefail

# Updates Tauri's own dependencies on both sides and checks the pairs that
# must agree, per https://v2.tauri.app/develop/updating-dependencies/ :
# @tauri-apps/plugin-X (npm) and tauri-plugin-X (cargo) must stay on
# matching versions; @tauri-apps/api (npm) and tauri (cargo) must stay on
# matching minors. This script only touches those packages/crates, never
# react/vite/vitest/i18next/shadcn/tailwind — those are unrelated updates
# with their own risks (shadcn especially: an exact-pinned version, see
# specs/technical-stack.md).
#
# Requires jq. Does not commit anything; review the diff and run the
# project's own checks (pnpm test, cargo check, pnpm tauri dev) before
# committing.

cd "$(dirname "$0")/.."

if ! command -v jq &>/dev/null; then
  echo "jq is required (brew install jq)" >&2
  exit 1
fi

echo "== JS: @tauri-apps/cli, @tauri-apps/api =="
pnpm update @tauri-apps/cli @tauri-apps/api --latest

echo
echo "== JS: @tauri-apps/plugin-* =="
pnpm update @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-opener @tauri-apps/plugin-sql --latest

echo
echo "== Rust: tauri, tauri-build, tauri-plugin-* crates (within src-tauri/Cargo.toml's existing ranges) =="
(cd src-tauri && cargo update)

echo
echo "== Pair check: npm package version vs matching cargo crate version =="
echo "A mismatch below needs a manual Cargo.toml/package.json edit before commit."

check_pair() {
  local js_name="$1" cargo_crate="$2"
  local js_version cargo_version
  js_version=$(jq -r --arg n "$js_name" '.dependencies[$n] // .devDependencies[$n] // "MISSING"' package.json)
  cargo_version=$(grep -A1 "^name = \"$cargo_crate\"\$" src-tauri/Cargo.lock | grep '^version' | head -1 | cut -d '"' -f2)
  printf "%-28s %-10s  <->  %-24s %s\n" "$js_name" "$js_version" "$cargo_crate" "${cargo_version:-MISSING}"
}

check_pair "@tauri-apps/plugin-dialog" "tauri-plugin-dialog"
check_pair "@tauri-apps/plugin-fs" "tauri-plugin-fs"
check_pair "@tauri-apps/plugin-opener" "tauri-plugin-opener"
check_pair "@tauri-apps/plugin-sql" "tauri-plugin-sql"

echo
echo "Next: pnpm test, cargo check (from src-tauri/), pnpm tauri dev smoke test."
echo "If any resolved version in specs/technical-stack.md is now stale, update it too."
