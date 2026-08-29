Status: done

# `scripts/release.sh`: one command that versions, tags and builds a release

## Why

Today, cutting a release is four manual steps: run `set-version.sh <version>`, then each of `build-macos.sh`,
`build-windows.sh` and `build-linux.sh` in turn, and remember to commit the version bump yourself. Nothing ties a
built set of installers back to the exact commit they came from. This plan adds one script that does the whole
sequence, asked for after the dead-code cleanup and build-time investigation earlier this session.

Decided already, in conversation with Julien:
- Scope is version bump + build + a local git commit and tag — **not** a push. `git push`/`git push --tags` stays a
  separate, manual, explicit step, run only after the produced installers have actually been checked to work.
- Platform selection is via flags (`--macos`/`--windows`/`--linux`); with none given, all three build.
- The script must be idempotent: re-running it with the same version and no code changes must not fail, must not
  create a second commit, and must not move an existing tag.

One addition not explicitly asked for, flagged here rather than assumed silently: a test-suite preflight
(`pnpm test` and `cargo test`) before the version bump, skippable with `--skip-tests`. Cutting a release is exactly
the moment a broken build is most expensive to ship, and both suites already run in well under a minute (`pnpm
test`: ~10s per an earlier measurement this session; `cargo check` alone: ~22s cold). Strike this from the plan
before approving if it's not wanted.

## What the script does not do

- Does not push the commit or the tag. It prints the exact commands to run once the artifacts are verified.
- Does not upload or publish anything anywhere — `specs/technical-stack.md` is explicit that this application has no
  CI and no public release process; this script automates the existing manual sequence, it doesn't add a new one.
- Does not run `provision.sh` — each `build-*.sh` already fails fast with a clear message
  (`WINDOWS_TARGET_MISSING`, `PODMAN_NOT_FOUND`, etc.) if the toolchain isn't set up, and re-provisioning on every
  release run would be slow for no benefit on a machine that's already set up.
- Does not run `clean.sh` first. All three `build-*.sh` scripts already overwrite their own previous output
  (confirmed by reading them: `tauri build` overwrites the dmg/exe bundle directories, and `build-linux.sh` removes
  its own volume's previous bundle output before running).

## Usage

```
scripts/release.sh <version> [--macos] [--windows] [--linux] [--skip-tests]
```

- `<version>`: required, `year.month.day` unpadded (e.g. `2026.8.29`) — same format `set-version.sh` already
  enforces, and the same regex is reused rather than re-invented.
- No platform flag: build all three, in a fixed order (macOS, Windows, Linux) regardless of flag order, so output
  is always in the same sequence.
- One or more platform flags: build only those, in that same fixed order.
- `--skip-tests`: skip the `pnpm test` / `cargo test` preflight. For re-running one platform after the same
  version already passed the suite once this session.

## Step by step

1. **Parse arguments.** Unknown flag or missing version → usage message, exit `1`.

2. **Preflight tests** (unless `--skip-tests`):
   - `pnpm test` from `homework/`.
   - `cargo test --quiet` from `homework/src-tauri/` (there are Rust-side tests today, in `migrations.rs` and
     `backup.rs`).
   - Either failing aborts immediately: `TESTS_FAILED`, exit `2`. Nothing below this point has run yet, so there is
     nothing to undo.

3. **Guard against unrelated dirty state in the version files**, before touching them:
   `git status --porcelain -- package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json`.
   If that's non-empty, abort: `RELEASE_FILES_DIRTY — <paths> already have uncommitted changes unrelated to this
   release; commit or stash them first`, exit `3`. This is what keeps a re-run from ever folding someone's
   in-progress, unrelated edit to one of these files into a `chore: release` commit.

4. **Set the version**: run `./scripts/set-version.sh <version>` unchanged, propagating its own exit code and
   message on failure (`INVALID_VERSION`, `CARGO_CHECK_FAILED`).

5. **Commit, if there's anything to commit**:
   `git diff --quiet -- package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json`.
   - Non-empty diff: `git add` exactly those four paths (never `-A`), commit
     `chore: release <version>`.
   - No diff (this exact version was already set and committed by an earlier run): print
     `--- version <version> already committed, nothing to stage ---` and continue. This is the idempotent case.

6. **Tag**, `TAG="v<version>"`:
   - If `refs/tags/$TAG` doesn't exist: `git tag -a "$TAG" -m "Release <version>"`.
   - If it exists and already points at `HEAD`: print `--- $TAG already points here, nothing to do ---` and
     continue (idempotent case).
   - If it exists and points somewhere else: abort, `TAG_CONFLICT — $TAG already exists on a different commit
     (<sha>); delete it manually first if you intend to re-tag this release`, exit `4`. The script never force-moves
     a tag on its own.

7. **Build each selected platform**, fixed order macOS → Windows → Linux, running the existing
   `build-macos.sh`/`build-windows.sh`/`build-linux.sh` unchanged:
   - Capture each script's stdout; its own last non-empty line is already the artifact path (all three scripts
     already end with exactly that, confirmed by reading them).
   - Non-zero exit from a build script aborts immediately (does not attempt the remaining platforms):
     `RELEASE_BUILD_FAILED — <platform> exited <code>; fix and re-run: ./scripts/release.sh <version> --<platform>`,
     exit `5`. Because steps 4–6 are already idempotent, this re-run naturally skips straight to the still-missing
     build — no flag needed to "resume".

8. **Summary**, only for the platforms actually built this run:
   ```
   --- release <version> ready, not pushed ---
   macOS:   <path from step 7>
   Windows: <path from step 7>
   Linux:   <path from step 7>

   Verify each artifact actually runs before publishing anything. Once satisfied:
     git push
     git push origin v<version>
   ```

## Files touched

- `homework/scripts/release.sh` (new) — the script above.
- `specs/technical-stack.md` — the "Distribution"/"Versioning" sections currently describe the four scripts as
  separate manual steps; add `release.sh` alongside them as the sequence that ties version + build + local commit
  and tag together, explicit that it still never pushes.
- `homework/README.md` — one line alongside the existing `set-version.sh`/`build-*.sh` mentions.

## Verification

- Dry run with an already-released version and no code changes, no flags: confirm it reports "already committed" /
  "already points here" for steps 5–6, and still rebuilds and reports all three artifacts.
- Run with a single platform flag (e.g. `--macos`) after a full run: confirm only macOS rebuilds and only macOS
  appears in the summary, and steps 4–6 are still no-ops.
- Force a `TAG_CONFLICT`: tag manually at one commit, make an empty follow-up commit, re-run — confirm it aborts
  with the conflict message rather than moving the tag.
- Force a `RELEASE_FILES_DIRTY` abort: hand-edit `package.json`'s version-adjacent whitespace without committing,
  run the script, confirm it refuses before calling `set-version.sh`.
- Confirm no invocation of the script, in any of the above, ever runs `git push` in any form.
- `pnpm test` and `cargo check` both still pass after `release.sh` exists (it's a new shell script; nothing else
  changes).
