Status: approved

# Course colors

Give every course a color, chosen when it is created (with a random default) and changeable afterwards from the side
panel. Show it subtly in the daily and weekly views as a colored left border on the course's block of homework.

This plan is self-contained: an agent starting cold should need only this file, `specs/` and `CLAUDE.md`.

## Where this starts from

Milestones 0–11 and the packaging scripts are done (see `plans/2026-08-23-roadmap.md`). Courses exist, are created,
renamed and archived from `src/components/course-editor.jsx`, backed by `src/db/courses.js`. Migration 1 in
`src-tauri/src/migrations.rs` has never shipped, so it is edited in place — **the schema stays at version 1**, no new
migration is appended, and `SCHEMA_VERSION` in `src/db/schema.js` does not change.

`src/components/course-group.jsx`'s `CourseGroup` is the one component both the daily view and every day block of the
weekly view render a course heading and its cards through — required by `specs/functional-specs.md` so the two views
render identically. That is the one place the left-border indicator needs to live.

## Decisions taken with Julien on 2026-08-26

These are settled. Do not reopen them.

1. **The picker is a curated swatch grid, not a spectrum picker.** A grid of pre-chosen, visually distinct colors to
   tap, plus a hex text field below for anyone who wants to type an exact code. No new dependency: built from
   existing primitives (`Popover`, `Input`, plain buttons).
2. **The palette has 20 colors: 17 hues plus black, gray and brown**, named `red, orange, amber, yellow, lime,
   green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose`. Black and gray cover a
   student reasonably wanting a course to read as "no particular color", which the 17 hues alone can't express —
   which makes 19; `brown` is added as the 20th rather than a third neutral, since a third gray-family entry would
   sit closer to the other two than any hue is to its neighbors, working against the whole point of quick visual
   separation. See step 2 for the exact hex values.

   **Revised 2026-08-26, after the first manual pass**: the first implementation sourced all 20 values from
   Tailwind's `-500` scale verbatim. Julien flagged two things live in the running app: no basic/bright yellow was
   actually in the palette (Tailwind's `yellow-500` reads as a muted gold next to `amber-500`, and neither is what a
   student would call "yellow"), and more generally he wants classic, crayon-box-recognizable colors, not a
   preset lifted from a CSS design-system scale. The 20 hex values were replaced with independently-chosen bold
   colors at roughly the same 17 hue-wheel positions plus the same 3 neutrals — this plan's own hex table (step 2)
   and `src/lib/course-colors.js`'s values are updated together, so they never went out of sync. Nothing else about
   this decision changed: still 20 entries, still moderately saturated (not neon, not pastel), still no extra
   "soften the color" logic needed in the UI code
3. **A new course defaults to a random color from that same palette**, never an arbitrary RGB value — a random pick
   always looks good; an arbitrary one occasionally does not.
4. **The indicator is a colored left border on the course's whole block** (heading + its cards), not an underline on
   the heading text and not a dot. Thin (2px) and therefore inherently subtle regardless of how saturated the
   picked color is — no opacity trick needed for active courses. An archived course's border is faded the same way
   its heading text already is (see step 6).
5. **Color changes write immediately, no confirmation** — the same "no friction" precedent as the homework
   completion checkbox (`specs/functional-specs.md`: *"Clicking it toggles completion and writes immediately, with
   no confirmation"*). There is no separate Save step for color the way there is for a rename.
6. **No uniqueness constraint on color.** Two courses may share a color. Nothing in the request asks for this and it
   is not invented here.
7. **The local dev database is erased**, not migrated — Julien's explicit instruction, since nothing has shipped yet.
   `/Users/jponge/Library/Application Support/org.ponge.homework/homework.db` (plus any `-wal`/`-shm` sidecar) is
   deleted as one of the last steps, after everything else lands, so `pnpm tauri dev` opens a fresh database that
   runs migration 1 with the new column from scratch.

## Not in this milestone

- Recoloring via any bulk/import path beyond the existing SQL export/import mechanism (which carries the color
  through automatically once the column exists — see step 8)
- Any per-homework-entry color override — color is a course attribute only
- Any accessibility fallback for the swatch grid beyond an accessible name per swatch (`specs/functional-specs.md`
  already scopes keyboard/touch parity for hover-revealed controls as out of scope; the swatch grid is not
  hover-revealed, but it gets the same accessible-name treatment every icon-only button in this codebase gets)

## Dependencies

None. No new Mise tool, pnpm package or cargo crate. The picker is built from `Popover`, `Input` and plain buttons,
already in `src/components/ui/`.

## Steps

Work test-first throughout, exactly like milestone 7: the behaviour below is pinned by the decisions above where the
specs are silent, and by `specs/data-model.md` / `specs/functional-specs.md` once step 9 updates them.

### 1. Migration 1 and `specs/data-model.md`

Add `color` to `courses` in `src-tauri/src/migrations.rs`, in place (not a new migration):

```sql
CREATE TABLE courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color       TEXT NOT NULL CHECK (color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
    archived_at TEXT,
    created_at  TEXT NOT NULL
);
```

Lowercase hex digits only, six of them, always prefixed with `#` — spelled out with `[0-9a-f]` six times rather than
a `LIKE`-style wildcard, the same reasoning the file already documents for `due_date`'s pattern. The application
layer normalizes to lowercase before it ever writes (step 3), so this is a backstop, not validation, exactly the
relationship `courses_active_name` has to `validateCourseName`.

Update `specs/data-model.md`'s `courses` table and `CREATE TABLE` snippet to match, and add a short paragraph next to
the "two kinds of time" style note explaining the hex format and that it is a backstop.

### 2. `src/lib/course-colors.js` (new, pure)

```js
export const COURSE_COLORS  // 20 { key, hex } pairs, e.g. { key: "red", hex: "#ef4444" }
export function pickRandomCourseColor(random = Math.random)  // hex string, uniform pick from COURSE_COLORS
export function normalizeCourseColor(color)   // trims, lowercases, does not add a leading '#' if missing
export function validateCourseColor(color)    // null, or "empty" / "invalid" — mirrors validateCourseName's shape
```

`pickRandomCourseColor` takes an injectable `random`, the same dependency-injection pattern `nowInstant` uses for the
clock, so a test can pin which color comes out. `validateCourseColor` accepts any of the 20 curated colors but also
any other well-formed `#rrggbb` typed into the hex field — the palette constrains the swatch grid's own buttons, not
what counts as a valid color to store.

The 20 `{ key, hex }` pairs (revised 2026-08-26 — see decision 2's update):

| key | hex | key | hex | key | hex | key | hex |
|---|---|---|---|---|---|---|---|
| `red` | `#e63946` | `sky` | `#339af0` | `purple` | `#9c36b5` | `black` | `#404040` |
| `orange` | `#f4772e` | `blue` | `#3457d5` | `fuchsia` | `#d6249f` | `gray` | `#6c757d` |
| `amber` | `#f4a300` | `indigo` | `#4c4ddc` | `pink` | `#f7568c` | `brown` | `#8b5a2b` |
| `yellow` | `#ffd60a` | `violet` | `#7048e8` | `rose` | `#ff6b81` | | |
| `lime` | `#a4d65e` | | | | | | |
| `green` | `#2ecc71` | | | | | | |
| `emerald` | `#16a085` | | | | | | |
| `teal` | `#159895` | | | | | | |
| `cyan` | `#22b8cf` | | | | | | |

These 20 values were chosen independently, at roughly the same 17 hue-wheel positions as the palette's first draft
plus the same 3 neutrals, but deliberately not sourced from Tailwind or any other CSS theme's scale — bold,
classic, crayon-box colors a student already has a name for. `yellow` in particular is a real bright yellow rather
than the muted gold a `-500`-scale yellow reads as next to its neighboring `amber`.

`black` is `#404040`, not literal `#000000`. Julien and I discussed this on 2026-08-26: a pure-black left border is
close to invisible against the dark system palette's own near-black background
(`--background: oklch(0.147 0.004 49.3)`), and dark-mode support itself is required by
`specs/design-guidelines.md` and stays in scope rather than being dropped to sidestep this. `#404040` is dark enough
to read as "black" to a student in both palettes while staying perceptibly lighter than the dark background, so the
left border is actually visible there. This is the one palette entry not picked purely for hue — it exists
specifically to keep the "black" swatch usable in the dark theme.

`key` is what the accessible name and the i18n catalog hang off (step 7): a swatch's `aria-label` must say "Red" /
"Rouge", not read out a hex code to a screen reader.

### 3. `src/db/courses.js`

- `createCourse(name, color, createdAt)` — insert `color` alongside `name`; existing three-argument call sites in
  `course-editor.jsx` all move to four
- `setCourseColor(id, color)` — new, mirrors `renameCourse`'s shape: `UPDATE courses SET color = $1 WHERE id = $2`.
  Kept separate from `renameCourse` rather than folded into one `updateCourse(id, { name, color })`: the editor
  writes name and color through two independent controls (step 4), and two single-purpose functions match that
  better than one that always has to be told which field it is touching
- `listCourses` already does `SELECT *`-shaped column listing by name; add `color` to it

### 4. `src/components/color-picker.jsx` (new)

A controlled, presentational component — no `useAppData()`, no `src/db/` import, same rule
`HomeworkEditForm` in `course-group.jsx` already follows:

```jsx
<ColorPicker value={hexColor} onChange={(hex) => …} triggerLabel={t(…)} />
```

- The trigger is a small swatch button showing `value`, opening a `Popover`
- Inside: a grid of 20 swatch buttons, one per `COURSE_COLORS` entry, each with an `aria-label` from the catalog
  (step 7) and a visible selected/checked state for the one matching `value` (case-insensitive — `value` may be a
  custom hex the grid doesn't contain, in which case nothing in the grid shows selected, which is correct)
- Below the grid, a hex `Input`. Typing does not call `onChange` on every keystroke: it validates through
  `validateCourseColor` on change, calls `onChange(normalizeCourseColor(...))` only once the value is well-formed,
  and shows an inline error (mirroring `course-editor.jsx`'s `PROBLEM_KEYS` pattern) otherwise. `validateCourseColor`
  is case-insensitive — `"#FF0000"` is well-formed, same as `"#ff0000"` — since `normalizeCourseColor` lowercases it
  on the way out; only `normalizeCourseColor`'s output is ever written or compared against stored values. Clicking a
  swatch always calls `onChange` immediately and also updates the hex field to match
- `Escape` closes the popover without special-casing (Radix's own `Popover` behavior — no capture-phase workaround
  is needed here the way `course-editor.jsx` needs one for `Sheet`, because a `Popover` is not a `Sheet`; verify this
  is actually true in the real app rather than assumed, since the codebase has already been burned once by a nested
  dismissal interaction)

### 5. `src/components/course-editor.jsx`

- New-course draft state gains a `color` field, seeded with `pickRandomCourseColor()` on mount and re-seeded with a
  fresh random pick after every successful `add` (so the row is never offering the color that was just used)
- The add row gains a `ColorPicker` next to the name `Input`. `add()` validates the color through
  `validateCourseColor` the same way it validates the name, reporting a problem inline if the (unlikely, since it
  starts valid) hex field was hand-edited into something malformed
- `createCourse` is called with the draft's normalized color
- Each active course row gains a `ColorPicker` reading that course's current `color`. Its `onChange` calls
  `setCourseColor(course.id, hex)` immediately, followed by `reload()` — no draft state, no Save/Cancel, per decision
  5. A write failure goes to `onError`, same as every other write in this file

### 6. `src/components/course-group.jsx`

`CourseGroup`'s outer `<section>` gains a left border in the course's color:

```jsx
<section
  className={cn("flex flex-col gap-2 border-l-2 pl-3", archived && "opacity-50")}
  style={{ borderColor: group.course.color }}
>
```

`opacity-50` on the whole section would also fade the cards, which is wrong — only the heading text is muted today.
Confirm during manual testing (step 10) whether fading just the border (a second inline style, or a dedicated
`border-current`-style approach) reads better than the existing archived treatment; adjust if the plain `opacity-50`
version looks off against real content, but do not invent a new muting rule beyond what's needed to make the border
match the heading's existing treatment.

### 7. Catalogs

New keys in both `src/i18n/en.json` and `src/i18n/fr.json`:

- `colors.<key>` for all 20 palette entries — a plain color name a child reads normally ("Red" / "Rouge"), used as
  each swatch's `aria-label`
- `courses.colorPicker` (or similar) — the accessible name for the trigger button, likely parameterized with the
  course name for the per-row pickers the same way `courses.rename` is
- `courses.colorHexPlaceholder`, `courses.colorInvalid` — the hex field's placeholder and its inline validation
  message

French is not a word-for-word translation. `catalogs.test.js` enforces key parity but cannot see a key nothing
renders — only add keys that are actually rendered.

### 8. Export / import

- `src/lib/sql-export.js`: add `"color"` to `COLUMNS.courses`
- `src/db/backup.js`: add `'color', color` to the `courses` `json_object(...)` in `EXPORT_QUERY`

No other change here — `generateExport`/`parseExport`/`buildImportScript` are column-name-driven and carry the new
column through once these two lists know about it. `SCHEMA_VERSION` does not change (decision in "Where this starts
from").

### 9. Specs

- `specs/data-model.md`: the `courses` table and `CREATE TABLE` per step 1
- `specs/functional-specs.md`: under courses, note that a course has a color chosen at creation (random default,
  changeable afterwards) and, under the main view, that each course's block shows a subtle colored left border in
  its color in both the daily and weekly views
- `plans/2026-08-23-roadmap.md`: link this file once done, if that document tracks post-milestone work — check its
  current shape before deciding where this entry goes

### 10. Erase the local database

Last step, after everything above lands and passes review. Delete
`/Users/jponge/Library/Application Support/org.ponge.homework/homework.db` and any `homework.db-wal` /
`homework.db-shm` beside it. Confirm with `ls` first that nothing unexpected is there.

## Definition of done

- `pnpm test` passes
- `pnpm build` is clean
- `cargo check` passes (migration SQL changed)
- `pnpm tauri dev` starts against a freshly erased database and you have **actually exercised**: creating a course
  and seeing its random default color, changing a course's color through both the swatch grid and the hex field,
  and the left-border indicator on real content in both the daily and weekly views, in both light and dark system
  appearance. A screenshot of the weekly view with a few differently-colored courses belongs in the summary
- Export a database with colored courses, import it back, and confirm colors survive — the one part of this that a
  unit test can't fully stand in for, since `buildImportScript` going through the real Rust transaction command is
  Tauri-runtime-only
- State plainly what you did not verify

## Known traps

- **jsdom cannot see rendered color**, but it *can* see the `style` attribute — assert `borderColor` / the swatch
  button's inline style directly rather than trying to assert computed CSS, the same distinction milestone 7's known
  traps called out for "muted"
- **Don't let the hex field's `onChange` fire on every keystroke.** A half-typed hex (`"#e"`) is not a valid color
  and must not be written to `value` upstream until it parses — that would make `ColorPicker` uncontrolled from the
  outside for a few keystrokes at a time
- **`reload()` after every write**, same as every other mutation in this codebase — the context does not observe the
  database
- **The unique-index backstop has no equivalent here** — there is no uniqueness constraint on color, so nothing
  should be written expecting `execute` to ever reject a duplicate color
- **Don't bump `SCHEMA_VERSION`.** Nothing has shipped, so this is an edit to migration 1, not a new migration —
  bumping it would be following the "add a migration" playbook for a change that isn't one
- **`black` is `#404040`, not `#000000`** — deliberately, so the left border stays visible against the dark
  system palette's own near-black background. Verify this actually reads as intended on screen in both palettes
  during step 10's manual pass rather than trusting the reasoning alone
