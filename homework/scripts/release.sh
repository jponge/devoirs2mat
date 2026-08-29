#!/bin/bash
# Cuts a release: bumps the version, runs the test suites, commits and tags
# locally, then builds the requested installers. Never pushes — the commit and
# the tag stay local until the produced artifacts have actually been checked
# to work; the summary at the end prints the exact push commands to run once
# they have. See plans/2026-08-29-release-script.md for the full design.
SP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SP" || exit 9

VERSION=""
SKIP_TESTS=0
PLATFORMS_REQUESTED=()

usage() {
  echo "Usage: $0 <version> [--macos] [--windows] [--linux] [--skip-tests]"
  echo "  version must be year.month.day, unpadded — e.g. 2026.8.29"
  echo "  with no platform flag, all three are built"
}

for arg in "$@"; do
  case "$arg" in
    --macos|--windows|--linux)
      PLATFORMS_REQUESTED+=("${arg#--}")
      ;;
    --skip-tests)
      SKIP_TESTS=1
      ;;
    --*)
      echo "UNKNOWN_FLAG — $arg"
      usage
      exit 1
      ;;
    *)
      if [ -n "$VERSION" ]; then
        echo "UNEXPECTED_ARGUMENT — $arg"
        usage
        exit 1
      fi
      VERSION="$arg"
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  usage
  exit 1
fi
if ! [[ "$VERSION" =~ ^[0-9]{4}\.[1-9][0-9]?\.[1-9][0-9]?$ ]]; then
  echo "INVALID_VERSION — expected year.month.day, unpadded (e.g. 2026.8.29), got: $VERSION"
  exit 1
fi

# Fixed order regardless of flag order, so the summary at the end is always
# in the same sequence: macOS, then Windows, then Linux.
PLATFORMS=()
if [ ${#PLATFORMS_REQUESTED[@]} -eq 0 ]; then
  PLATFORMS=(macos windows linux)
else
  for name in macos windows linux; do
    for requested in "${PLATFORMS_REQUESTED[@]}"; do
      if [ "$requested" = "$name" ]; then
        PLATFORMS+=("$name")
        break
      fi
    done
  done
fi

VERSION_FILES=(package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json)
TAG="v$VERSION"

if [ "$SKIP_TESTS" -eq 0 ]; then
  echo "--- pnpm test ---"
  pnpm test || { echo "TESTS_FAILED — pnpm test"; exit 2; }

  echo "--- cargo test --quiet (src-tauri) ---"
  (cd src-tauri && cargo test --quiet) || { echo "TESTS_FAILED — cargo test"; exit 2; }
fi

# A version file already dirty before this script touched it is someone's
# unrelated in-progress edit, not a leftover from an earlier release run — an
# earlier run either committed its version bump (clean by the time it's done)
# or never got this far. Folding that into a "chore: release" commit would be
# wrong either way, so this refuses rather than guessing.
if [ -n "$(git status --porcelain -- "${VERSION_FILES[@]}")" ]; then
  echo "RELEASE_FILES_DIRTY — ${VERSION_FILES[*]} already have uncommitted changes unrelated to this release; commit or stash them first."
  exit 3
fi

echo "--- ./scripts/set-version.sh $VERSION ---"
./scripts/set-version.sh "$VERSION" || exit $?

if git diff --quiet -- "${VERSION_FILES[@]}"; then
  echo "--- version $VERSION already committed, nothing to stage ---"
else
  git add -- "${VERSION_FILES[@]}" || { echo "GIT_ADD_FAILED"; exit 3; }
  git commit -m "chore: release $VERSION" || { echo "GIT_COMMIT_FAILED"; exit 3; }
fi

EXISTING_TAG_SHA=$(git rev-list -n1 "$TAG" 2>/dev/null)
if [ -z "$EXISTING_TAG_SHA" ]; then
  git tag -a "$TAG" -m "Release $VERSION" || { echo "GIT_TAG_FAILED"; exit 4; }
elif [ "$EXISTING_TAG_SHA" = "$(git rev-parse HEAD)" ]; then
  echo "--- $TAG already points here, nothing to do ---"
else
  echo "TAG_CONFLICT — $TAG already exists on a different commit ($EXISTING_TAG_SHA); delete it manually first if you intend to re-tag this release."
  exit 4
fi

# A parallel indexed array, not an associative one: the `/bin/bash` this
# script actually runs under on this Mac is 3.2.57 (Apple ships the last
# GPLv2 release), which has no `declare -A` — confirmed the hard way, every
# platform's artifact silently collapsed onto the last one built.
ARTIFACT_PATHS=()
for platform in "${PLATFORMS[@]}"; do
  echo "--- scripts/build-$platform.sh ---"
  OUTPUT=$(./scripts/build-"$platform".sh)
  STATUS=$?
  echo "$OUTPUT"
  if [ "$STATUS" -ne 0 ]; then
    echo "RELEASE_BUILD_FAILED — $platform exited $STATUS; fix and re-run: ./scripts/release.sh $VERSION --$platform"
    exit 5
  fi
  ARTIFACT_PATHS+=("$(echo "$OUTPUT" | tail -n1)")
done

echo "--- release $VERSION ready, not pushed ---"
for i in "${!PLATFORMS[@]}"; do
  printf '%-8s %s\n' "${PLATFORMS[$i]}:" "${ARTIFACT_PATHS[$i]}"
done
echo ""
echo "Verify each artifact actually runs before publishing anything. Once satisfied:"
echo "  git push"
echo "  git push origin $TAG"
