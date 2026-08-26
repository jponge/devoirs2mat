Status: done

# Milestone 9 — Creating, editing and deleting homework

Scope, verbatim from `plans/2026-08-23-roadmap.md`:

> Quick add: one hover-revealed component shared by the day block and the daily list, inserting a card already in its
> edit state; nothing written until `Save`, `Cancel` discards the card, the due date is the day added to and is not
> editable while creating. Edit in place: the card becomes the edit state, not a modal, and does not move; text as raw
> Markdown in a textarea, plus course and due date; `Save` commits, `Cancel` restores the pre-edit values, `Escape`
> equals `Cancel`. Course is the only required field and its error is inline on the field; empty text saves happily.
> Delete behind a confirmation dialog — a real `DELETE`, final, no undo. Hover-revealed controls are deliberate:
> keyboard and touch parity is out of scope and is not to be "fixed" as an accessibility bug.

The relevant `specs/functional-specs.md` section is "What the application does in the main view" (adding / editing /
deleting a homework entry, and the hover-reveal paragraph above it). `db/homework.js` already has
`createHomework` / `updateHomework` / `deleteHomework`; nothing there needs to change.

## Decisions confirmed with Julien before writing this plan

1. **Quick-add slot placement**: a fixed slot at the bottom of the day block / the daily list, below all course
   groups. The hover-revealed "+" button lives there and turns into the draft card in place; once saved, the entry
   moves into its real course group on the next `reload`.
2. **One draft at a time**: clicking quick-add while a draft is already open is a no-op (it does not open a second
   one), the same way `course-editor.jsx`'s inline add field is singular.
3. **Editing an entry whose course is archived**: the course picker offers the active courses *plus* the entry's own
   course if it is archived, shown muted, so that saving without touching the course field never forces a change.
   Other archived courses are never offered.
4. **Quick-add's course field starts pre-filled**, not empty: the picker defaults to the first active course in
   alphabetical order (`compareCourses` order), so `Save` works immediately even if the student never touches that
   field. This is a deliberate choice to make "we do not want an entry without a course" true by construction rather
   than by blocking `Save` on an untouched field — Julien flagged this as important and asked to iterate if it turns
   out wrong once built, so re-check it against the running app before calling this milestone done, not just against
   the tests.

## New shadcn components (no new npm dependency expected)

- `textarea` — the raw-Markdown text field, both for quick-add and edit-in-place.
- `select` — the course picker.

Both are Radix primitives and `radix-ui` (the umbrella package) is already a dependency, the same reasoning
`specs/technical-stack.md` recorded for `checkbox` in milestone 8. Verify this by diffing `package.json` before and
after running the command below, rather than assuming — if either one does pull something new, stop and ask before
keeping it.

```
pnpm dlx shadcn@4.19.0 add textarea select -y < /dev/null
```

Run from `homework/`, pinned to the same CLI version `specs/technical-stack.md` used for every prior `add`.
`< /dev/null` so an unexpected prompt fails fast instead of hanging.

No other new component is needed:

- The due-date picker in edit-in-place reuses the existing `Popover` + `Calendar` combination from
  `date-navigator.jsx` — see the `src/lib/calendar-intl.js` extraction below.
- The delete confirmation reuses the existing `AlertDialog`, the same four sub-components `course-editor.jsx`
  already uses.

## Architecture

### `src/lib/calendar-intl.js` (new, pure — extracted, not duplicated)

`date-navigator.jsx` currently defines `intlFormatters(language)` and `intlLabels(language, t)` as local functions.
The edit-in-place due-date picker needs the exact same `Intl`-based localisation of `react-day-picker` (Monday-first,
formatted and announced in the active language) — copying those ~25 lines into a second file would be exactly the
kind of drift `specs/technical-stack.md` warns about elsewhere. Move both functions, unchanged, into
`src/lib/calendar-intl.js` and import them from both `date-navigator.jsx` and the new due-date field. `labelNav`,
`labelPrevious`, `labelNext` in `intlLabels` currently use `topBar.*` keys — the edit-in-place picker does not need a
"go to previous/next month" nav label distinct from the top bar's, so it can reuse the same three keys; do not invent
parallel ones.

### `src/lib/homework.js` (new, pure)

Mirrors `src/lib/courses.js`'s reason-key pattern:

```js
// null when `courseId` is fine to save, otherwise "required".
export function validateHomeworkCourseId(courseId) {
  return courseId === null || courseId === undefined ? "required" : null;
}
```

Given decision 4, the course field is always pre-filled and a Radix `Select` has no built-in way to end up with no
value once it has one — so in the UI as specified, this check is close to unreachable. It is still wired in on both
`Save` paths (defensive, cheap, matches the functional spec's explicit "its error is inline on the field"
requirement) but say plainly, when reporting this milestone, that the inline-error path could not be exercised
through the built interface — only through the unit test that calls the function directly.

### `src/components/course-group.jsx` (extended)

Its own header comment already says this is "the one place both views' cards go through" — the edit state and the
shared edit-form fields belong here, not in a new file.

**New exported `HomeworkEditForm`** — controlled, presentational, no `useAppData()`, no DB import:

```
HomeworkEditForm({
  text, courseId, dueDate,       // current field values
  dueDateEditable,                // false for quick-add, true for edit-in-place
  courseOptions,                  // [{ id, name, archived_at }], already filtered+sorted by the caller
  error,                          // null | "required", from validateHomeworkCourseId
  onTextChange, onCourseChange, onDueDateChange,
  onSave, onCancel,
})
```

- `Textarea` bound to `text`. No validation — an empty value saves happily, per spec.
- `Select` bound to `courseId`. Radix `Select` values are strings: convert with `String(course.id)` for each
  `SelectItem` and `Number(value)` in `onValueChange` before calling `onCourseChange`. This id round-trip is exactly
  the kind of thing a careless refactor breaks silently — test it with a multi-digit id (something like `12`) so a
  string/number mismatch cannot pass by coincidence with a single-digit one. An option built from an archived course
  renders muted (`text-muted-foreground`, matching `CourseGroup`'s own heading treatment).
- Due date: when `dueDateEditable`, a `Popover` + `Calendar` exactly as `date-navigator.jsx` builds it (`weekStartsOn={1}`,
  `formatters`/`labels` from `src/lib/calendar-intl.js`, trigger button labelled with `formatFullDate`). When not
  editable, the same date rendered as plain static text, no control.
- `Save` / `Cancel` buttons. An `onKeyDown` on the form's root element calling `onCancel` when `event.key === "Escape"`
  — this component is never inside a `Sheet`, so none of `course-editor.jsx`'s `data-cancels-escape` capture-phase
  workaround is needed here.
- The inline error (`t("homework.courseRequired")`) renders under the `Select` when `error === "required"`, `role="alert"`,
  same convention as `course-editor.jsx`'s `#course-add-problem`.

**`HomeworkCard` gains an edit state**, local `useState`:

- View state: existing markup, plus the card's outer `div` gains `className="group"` and two new hover-revealed
  buttons (`opacity-0 group-hover:opacity-100 transition-opacity`, `PencilIcon` / `Trash2Icon` from `lucide-react`,
  same icons `course-editor.jsx` uses), each `aria-label`'d (`homework.edit` / `homework.delete`). The always-visible
  checkbox is untouched — it must never be hover-gated, per spec.
- Clicking edit seeds local `text` / `courseId` / `dueDate` state from the entry's current values and switches to
  editing. `courseOptions` is built from `courses` (see below) with `compareCourses` from `src/lib/grouping.js`:
  active courses, plus the entry's own course appended if it is archived.
- `Save`: run `validateHomeworkCourseId`; on failure set the inline error and stay in edit state; on success call
  `updateHomework(item.id, { text, dueDate, courseId })`, `await reload()`, exit edit state.
- `Cancel` / `Escape`: drop the local draft state, exit edit state, no write.
- Delete button opens an `AlertDialog` (copy the open/confirm/cancel wiring from `course-editor.jsx`'s
  `pendingDelete` pattern, one dialog per card or one shared `pendingDelete` state lifted to `CourseGroup` — either
  is fine, pick whichever keeps the diff smaller once the surrounding code is in front of you). Confirming calls
  `deleteHomework(item.id)`, then `reload()`.
- Both `updateHomework` and `deleteHomework` failures report through the existing `onError(failure, "save")` — the
  same convention `toggle` already uses, wired to `errors.saveFailed` in `App.jsx`. No new error kind needed.

**`CourseGroup` needs the full course list**, not just its own group's course, to build `courseOptions`. It already
calls `useAppData()` for `reload` — add `courses` to that same destructure rather than threading a new prop through
`daily-view.jsx` / `weekly-view.jsx`.

### `src/components/quick-add-homework.jsx` (new)

One component, used identically by `DayBlock` and `DailyView`, per the spec's explicit wording.

```
QuickAddHomework({ dueDate, onError })
```

- Calls `useAppData()` itself for `courses` and `reload`, and `useTranslation()` for copy and `i18n.language` —
  mirrors how `CourseGroup` self-serves from context rather than being handed everything as props.
- Closed state: a hover-revealed "+" button (`aria-label={t("homework.add")}`), rendered only when at least one active
  course exists — defensive; the whole main view is already gated on this by `App.jsx`'s first-run state, so this
  should never actually be reached with zero active courses, but a component that could render an unusable button is
  worse than one that quietly renders nothing.
- Clicking it opens a draft: local state `{ text: "", courseId: <first active course id, compareCourses order> }`.
  Renders `HomeworkEditForm` with `dueDateEditable={false}` and `dueDate` fixed to the prop. Only one draft at a time
  falls out naturally from this being local component state on a single instance per block/list — no extra guard
  needed beyond "the button doesn't render while a draft is already open".
- `Save`: validate (defensive, see `src/lib/homework.js` above), `createHomework({ text, dueDate, courseId, createdAt: nowInstant() })`,
  `await reload()`, close the draft.
- `Cancel` / `Escape`: close the draft, no write.
- Failures report through `onError(failure, "save")`, same convention as everywhere else in this milestone.

### `daily-view.jsx` / `weekly-view.jsx`

- `DayBlock`'s existing `<section data-testid="day-block" className="flex ... group ...">` — add `group` to its
  class list (it does not have one yet) and render `<QuickAddHomework dueDate={day.date} onError={onError} />` after
  the course groups / `EmptyLine`.
- `DailyView`'s existing top-level `<section className="flex animate-in flex-col gap-4 fade-in duration-300">` — add
  `group` to its class list and render `<QuickAddHomework dueDate={selectedDate} onError={onError} />` after the
  groups / `EmptyLine`, the same position as in `DayBlock`.

## Catalog additions

New keys under a `homework.*` block that already exists (`homework.empty`, `homework.toggleDone`). Drafts below
follow `specs/design-guidelines.md`: `tu` never `vous`, no exclamation marks, typographic `’`, plain and warm. Treat
these as a starting draft to refine while building, not a frozen spec — but keep both catalogs in lockstep, since
`src/i18n/catalogs.test.js` asserts identical key sets.

| key | en | fr |
|---|---|---|
| `homework.add` | Add homework | Ajouter un devoir |
| `homework.edit` | Edit | Modifier |
| `homework.delete` | Delete | Supprimer |
| `homework.save` | Save | Enregistrer |
| `homework.cancel` | Cancel | Annuler |
| `homework.textPlaceholder` | Write it here… | Écris-le ici… |
| `homework.course` | Course | Matière |
| `homework.dueDate` | Due date | Date à rendre |
| `homework.courseRequired` | Choose a course. | Choisis une matière. |
| `homework.deleteTitle` | Delete this homework? | Supprimer ce devoir ? |
| `homework.deleteBody` | You can’t undo this. | Tu ne pourras pas revenir en arrière. |
| `homework.deleteConfirm` | Delete | Supprimer |
| `homework.deleteCancel` | Cancel | Annuler |

## Test plan (written first, per the working agreement)

1. **`src/lib/homework.test.js`** (new) — `validateHomeworkCourseId`: `null` and `undefined` → `"required"`; any
   number (including `0`, which is falsy but a legitimate — if implausible — id) → `null`.
2. **`src/components/course-group.test.jsx`** (extended) — new `describe` blocks:
   - *editing*: the edit button reveals the form pre-filled with the entry's current text/course/due date; `Save`
     calls `updateHomework(id, { text, dueDate, courseId })` with the edited values and then reloads; `Cancel`
     restores the original values with no call to `updateHomework`; `Escape` inside the form behaves like `Cancel`;
     the course `Select` includes the entry's own archived course (muted) when its course is archived, and excludes
     every *other* archived course; a multi-digit course id round-trips correctly through the `Select`.
   - *deleting*: the delete button opens the confirmation dialog; confirming calls `deleteHomework(id)` then reloads;
     dismissing the dialog (cancel, or click outside) leaves the entry in place and calls neither.
3. **`src/components/quick-add-homework.test.jsx`** (new) — the closed state shows only the "+" button; opening it
   inserts a draft whose due date is the fixed prop and is not editable, and whose course is pre-selected to the
   first active course in `compareCourses` order; `Save` calls `createHomework` with the fixed due date, the chosen
   course and the typed text, then reloads and closes the draft; `Cancel` and `Escape` close the draft with no call
   to `createHomework`; clicking "+" again while a draft is open does not open a second one; renders no button at all
   when `courses` has zero active entries.
4. **`src/components/shell.test.jsx`** (extended) — full `render(<App/>)` integration, matching how the weekly view,
   daily view and course editor are already exercised there:
   - quick-add is reachable from the daily list and from a weekly day block, and a saved entry appears in its course
     group afterwards;
   - editing and deleting an entry through the full render tree, including the archived-course-kept-as-an-option
     case (seed a homework row on an archived course through the mocked `listCourses`/`listHomeworkBetween`, the same
     way `App.test.jsx`/`shell.test.jsx` already fake the data layer — no real database needed for this);
   - a failed create, update or delete toasts `errors.saveFailed` rather than failing silently, the same assertion
     shape as the existing "a failing homework write" tests.
5. `src/i18n/catalogs.test.js` needs no new test — it already asserts key-set parity; just keep `en.json`/`fr.json`
   in sync as the keys above are added.

## Out of scope, explicitly

- Keyboard and touch parity for hover-revealed controls (the "+" button, the edit/delete buttons). This is a
  deliberate design decision per the functional specs and is not a gap this milestone closes.
- Any way to move a course back out of "archived, shown muted" in the edit picker (there is no un-archive feature
  anywhere in the application).
- Reordering entries, or anything about `done` — untouched by this milestone.

## Definition of done

- `pnpm test` passes.
- `pnpm tauri dev`, actually exercising: quick-add from both the daily list and a weekly day block; edit-in-place on
  all three fields including `Cancel` and `Escape`; delete with confirmation; the archived-course-kept-as-option case,
  seeded directly into `~/Library/Application Support/org.ponge.homework/homework.db` with `sqlite3` per the traps
  noted in the milestone kickoff (check `SELECT id, name FROM courses;` first — ids are not reliably 1, 2, 3 across
  sessions) — never by scripting keystrokes into the window, which does not reach the WKWebView.
- `cargo check` from `homework/src-tauri/` — expected to be a no-op since this milestone touches no Rust, stated
  explicitly rather than skipped.
- Three review subagents (architecture, quality-engineering, adversarial) against isolated rsync copies with
  `node_modules` symlinked in, run with `./node_modules/.bin/vitest run --watch=false`, briefed to mutation-test one
  mutant at a time and report must-fix findings only.
- A plain statement of what was not verified.
- Report what was fixed from the review and what was deliberately not, split explicitly — never drop a finding
  silently, never start a second review round unasked.

## Roadmap update on completion

Flip this file's `Status` line to `done`. Update the milestone table row in `plans/2026-08-23-roadmap.md` (currently
"not written yet" / "—") to this file's name and `done`, and refresh its "Where things stand" section to name the
new latest commit — only once Julien has actually approved a commit, never before.
