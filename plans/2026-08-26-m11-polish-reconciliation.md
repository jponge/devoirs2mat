Status: done

# Milestone 11 — Polish and reconciliation

Last milestone on `plans/2026-08-23-roadmap.md`. Unlike milestones 0–10, this one is not new functionality: it is an
audit of what the previous ten milestones already built, closing whatever gaps the audit actually finds. Read
`plans/2026-08-23-roadmap.md`'s "Where things stand" section first for the current state; this file assumes it.

A pre-check before writing this plan found the codebase in better shape than the roadmap's one-line milestone
description implies — worth recording so the plan is scoped to real gaps, not imagined ones:

- Appear/disappear animation classes (`animate-*`, `transition-*`, `data-[state=...]`) already exist in
  `course-group.jsx`, `weekly-view.jsx`, `daily-view.jsx` and `quick-add-homework.jsx`.
- Every write path that can fail already routes through an `onError`/`onHomeworkError`/`onBackupError` prop into
  `App.jsx`, which either toasts (`errors.saveFailed`, `errors.linkFailed`, `errors.languageFailed`,
  `errors.startupFailed`, `backup.*`) or leaves the failure inline on the field (`CourseEditor`'s name-refused case,
  documented at `course-editor.jsx:44`).
- `en.json` and `fr.json` currently have exactly the same 63 keys, no straight apostrophes in French, and no
  stray `vous`.

So this milestone is a verification pass with corrections where the audit finds something, not a rebuild. Treat
every section below as "confirm, and fix only what's actually wrong" — do not add animation, error handling, or
copy that the audit doesn't show a need for. That would be exactly the over-engineering `CLAUDE.md` rules out.

## 1. Animation audit

Against `specs/design-guidelines.md`'s "subtle animations... when components appear or disappear" and "do not
change default component sizes":

- Walk every place a component mounts/unmounts or changes state in a user-visible way: homework card appearing
  (quick-add save, or an import bringing new rows into view), a card being deleted, the edit-state transition on a
  card, the side panel/drawer opening and closing, a course being archived out of the active list, toast
  appearance (shadcn's `sonner` likely already animates this — confirm, don't reimplement it).
- For each, confirm there already is a transition and it reads as subtle (short duration, no bounce/scale that
  would imply a size change). Where one is genuinely missing or jarring (instant pop-in/pop-out), add the smallest
  Tailwind transition that matches the existing ones in `course-group.jsx`/`weekly-view.jsx` for consistency — do
  not introduce a new animation vocabulary or a dependency (no `framer-motion`; this is Tailwind transitions only,
  per `specs/technical-stack.md`).
- Confirm no default component size changed anywhere in the process (shadcn defaults for buttons, icons, text).

## 2. Failure-path audit

Against `specs/design-guidelines.md`'s "say what happened and what to do about it... never blame the student" and
the existing `onError` pattern:

- Enumerate every `catch`/`.catch()`/rejected-promise site across `src/` (components, `src/db/`, `src/lib/`) and
  confirm each one either reaches a toast, reaches an inline field error, or is deliberately swallowed with a
  one-line comment saying why (e.g. a best-effort background refresh). A silent catch with no comment and no user
  feedback is the failure mode to hunt for.
- Confirm every user-facing error string in both catalogs says what happened before what to do, addresses the
  student directly, and carries no blame — spot-check against the specific phrasing rules in
  `specs/design-guidelines.md`, not just presence of a string.
- Confirm `errors.*` and `backup.*` keys are exhaustive: every `t("errors....")`/`t("backup....")` call site in the
  code resolves to a real catalog key in both files (a typo'd key silently falls back to the key name itself in
  `i18next`, which is easy to miss visually).

## 3. Catalog audit

`en.json`/`fr.json` already match key-for-key with no straight apostrophes and no `vous` (confirmed before writing
this plan — re-confirm as part of the milestone since the count will have moved by the time this runs). Beyond
that:

- Read every string in both files against `specs/design-guidelines.md`'s tone rules, not just the mechanical
  checks: plain and warm, no jokes, no exclamation marks, no mascot voice, active voice, short sentences.
- Confirm every place the app formats a date or a number goes through `Intl` (per `specs/technical-stack.md`,
  "no date library") and that the French locale (`fr-FR` or whichever BCP-47 tag the app actually passes) produces
  correct output, not just the English one — exercise both languages live via `pnpm tauri dev`, not by reading the
  code and assuming.

## 4. Spec reconciliation

A full read of all four specs (`technical-stack.md`, `functional-specs.md`, `data-model.md`, `design-guidelines.md`)
against the current code, milestone 10's changes especially since those specs were edited quickly alongside a
mid-flight architecture change (the Rust import command). Fix anything that has drifted. This is the last chance
this project has a dedicated milestone for it — after this, spec/code drift has to be caught milestone-by-milestone
per the working agreement, with no dedicated cleanup pass.

## Deps to approve

None expected. If the animation audit finds a real gap that Tailwind's existing utility classes cannot cover
cleanly, stop and ask before reaching for a new dependency — do not add one preemptively.

## Definition of done — outcome (2026-08-26)

**1. Animation audit.** The audit's pre-check was right: most of the app already animated. Real gap found: the
entrance `animate-in fade-in` on `daily-view.jsx`'s section and `weekly-view.jsx`'s day blocks had no `key` tied to
the date, so React reused the same DOM node across navigation and the CSS animation only ever played once, on the
app's first render, never again. Fixed with `key={selectedDate}` / `key={day.date}`. Also added the same
entrance fade to `HomeworkEditForm`'s wrapper (plays every time a card enters edit mode, in-place or via quick-add)
and to a freshly-added `<li>` in `course-group.jsx`'s homework list and `course-editor.jsx`'s course list — both
keyed so the fade only ever plays for a genuinely new row, never on an ordinary data refresh. Adversarial review
caught a bug in that last part: `course-editor.jsx`'s editing-branch `<li>` shared its key with the non-editing
branch but didn't carry the animation class, so finishing or cancelling a rename toggled the class on the *same*
node and replayed the fade as if the row were new. Fixed by giving both branches the class, so it never toggles.

**2. Failure-path audit.** Found and fixed a real bug, not a hypothetical: `SidePanel` shared one `onError`
callback between the language switch and the course editor, hardcoded to `errors.languageFailed` ("Couldn't save
the language."). A failed course create/rename/archive showed that message — wrong, and never caught, because no
test exercised a course-write failure through the full `App` tree (only the isolated `course-editor.test.jsx`,
against a plain mock). Fixed by splitting into `reportLanguageFailure` and a generic `reportWriteFailure`, threaded
as two separate props (`onLanguageError`/`onCourseError`) through `TopBar` → `SidePanel`. A regression test was
added to `shell.test.jsx` and mutation-verified: reverting the fix makes the new test fail. Every other catch site
in `src/` was walked and found already correctly wired (toast, inline error, or a documented deliberate swallow) —
no other gap found. Every `errors.*`/`backup.*` catalog key used in code resolves in both catalogs.

**3. Catalog audit.** `en.json`/`fr.json` re-confirmed: identical 63 keys, no straight apostrophes, no `vous`, and a
full read against the design guidelines' tone rules found nothing to fix — the catalogs were already well-written.
`Intl` date formatting confirmed live in French (`pnpm tauri dev`, see below); English formatting is covered by
`format-dates.test.js`'s existing exact-string assertions in both languages, not re-driven live a second time.

**4. Spec reconciliation.** One real drift found: `specs/technical-stack.md`'s "File access" section still said
import "entirely from JavaScript... No Rust command is involved" — directly contradicted by the Persistence section
three paragraphs above it, which correctly describes `import_homework_database`. The File access section was
written before milestone 10's Rust fix; nobody went back to it. Fixed to say file access (path, bytes) stays
JavaScript-only while the import's database write does not, cross-referencing the Persistence section. No other
drift found across all four specs on a full read.

**Verification.** `pnpm test`: 411/411 passing throughout, including the new regression test. No Rust code touched,
so `cargo test`/`cargo check` were not re-run (`cargo check` was run once as a sanity check regardless — clean).
`pnpm tauri dev` was launched via `scripts/dev-probe.sh`: the app started with no error, and a screenshot of the
daily view confirmed correct rendering (including the list-Markdown feature from the prior session) with no visual
breakage from the new animation classes. **Not verified live a second time**: the side panel / course editor screen
specifically (the failure-path fix and the course-list animation fix) was not re-driven through the actual GUI this
session — it's covered instead by `shell.test.jsx`'s real-DOM integration tests (which click through the actual
`App` component tree, including the side panel and course editor) and by three independent review agents each
mutation-testing the fix. The animation replay itself (CSS motion, as opposed to the DOM mechanics that cause it)
is inherently unverifiable by this test suite, since jsdom does not execute CSS animations — the review agents
confirmed the causal mechanics (node identity, class presence) instead, which is the strongest verification
available short of a human watching it move.

**Review**, per `CLAUDE.md`: this diff touches user-visible behaviour (toast copy, animation timing), so all three
subagents ran (architecture, quality-engineering, adversarial), each mutation-testing against an isolated copy of
the repo. Architecture: 0 must-fix; noted but explicitly non-must-fix that `CourseEditor`'s three catches don't
pass a `kind` argument to `onCourseError` the way `CourseGroup`'s do, which today is harmless (both land on
`errors.saveFailed`) but would need remembering if `reportWriteFailure` ever grows a third message bucket —
**deliberately not fixed**, purely cosmetic symmetry with no present effect. Quality-engineering: 0 must-fix;
confirmed the prop threading is complete and the new test is genuine (not a false-positive), and noted the
animation-key fix has no automated coverage, which it judged acceptable given jsdom's CSS limits rather than a gap
— **nothing to fix, an accepted limitation**. Adversarial: 1 must-fix, the `course-editor.jsx` rename-replay bug
described above — **fixed**, and re-verified against the full suite (411/411 still passing; the fix is a pure CSS
class addition with no test able to directly observe it, consistent with the quality-engineering note above).

`plans/2026-08-23-roadmap.md`'s milestone table and "Where things stand" section are updated to close out the
roadmap, and that file's own `Status:` line moves from `approved` to `done`.

## Scope decision

Julien confirmed on 2026-08-26: run this as a single pass — all four audit sections, fixes applied as found, one
review round at the end, matching how milestones 0–10 ran.
