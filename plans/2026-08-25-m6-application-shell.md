Status: done

# Milestone 6 — Application shell

Sixth of the twelve milestones in `2026-08-23-roadmap.md`. Milestones 0 to 5 are implemented and committed on
`bootstrap/organic`; milestone 1 stays `approved` rather than `done` for a reason unrelated to this work (a human
still has to confirm the dark palette renders).

This milestone builds the frame every later milestone hangs things on: the top bar, the side panel, the shared data
context, and the toast that finally reports the startup failure milestone 4 has been holding since it landed. It
builds **no homework card and no course editor** — milestones 7, 8 and 9 own those. What it does build is the real
layout they will fill, empty, so that the two-column weekly geometry is exercised by a human before any card exists.

## Read before starting

- `specs/functional-specs.md` — the main view, the side panel, errors and feedback
- `specs/technical-stack.md` — the user interface section, the testing section (the jsdom polyfill note is about
  exactly this milestone), and the code layout
- `specs/design-guidelines.md` — all eight lines of it
- `plans/2026-08-23-roadmap.md` — the milestone 6 paragraph, which names the obligations inherited from milestone 4

Existing code this milestone touches or leans on: `src/App.jsx`, `src/boot.jsx`, `src/main.jsx`, `src/startup.js`,
`src/lib/dates.js`, `src/lib/grouping.js`, `src/db/courses.js`, `src/db/homework.js`, `src/i18n/preference.js`.

## Decisions taken with Julien on 2026-08-25

Four dependency and design questions the specs deliberately parked until this milestone, plus two behaviours the
specs did not pin down. All six are settled; do not re-open them.

1. **Date selection is the shadcn `calendar` inside a `popover`**, which means approving **`react-day-picker`**. It is
   a calendar *widget*, not a date-arithmetic library: `src/lib/dates.js` keeps owning every calculation, and the
   picker only hands back a `Date` that `fromLocalDate` converts. See the "no date library" note in step 1 below.
2. **Toasts are `sonner`.** The registry's `toast` is deprecated in its favour, and milestones 9 and 10 need it too.
3. **The side panel is the shadcn `sheet`**, not `drawer`. `sheet` is Radix Dialog based — Escape and outside-click
   dismissal for free, no new dependency, and it slides in from a side, which is what the specs describe. `drawer`
   would pull `vaul` to get a mobile bottom-sheet affordance that is wrong on a desktop window.
4. **The context loads real data in this milestone.** It owns the selected date and the view, and reads courses and
   the homework for the visible range from `src/db/`. Milestones 7 to 9 then only add mutations.
5. **In weekly view the date button shows the Monday–Sunday range**, via `Intl.DateTimeFormat.prototype.formatRange`.
   This is new behaviour and `specs/functional-specs.md` is updated for it in step 9.
6. **The main area gets its real, empty structure**: the daily list and the seven weekly blocks in the spec'd
   two-column layout, each showing the muted empty line the specs already require.

## What is deliberately NOT in this milestone

Say so in the summary rather than quietly doing any of it:

- Any homework card, quick-add affordance, edit state or delete dialog — milestones 8 and 9
- The course editor inside the side panel, and the first-run "add a course first" empty state with its button that
  opens the panel on that editor — milestone 7. The side panel in this milestone carries the language switch only
- Export and import — milestone 10
- Markdown rendering, `react-markdown`, `@tauri-apps/plugin-opener` wiring — milestone 8
- Highlighting the whole selected week inside the calendar popover when in weekly view. Not specified, and a
  `react-day-picker` modifier is easy to add later if Julien wants it
- Any keyboard or touch parity work for hover-revealed controls. The functional specs rule it out explicitly and say
  not to re-open it

## Dependencies to install

Both were approved on 2026-08-25. Nothing else may be installed; if a `shadcn add` wants to pull something not listed
here, **stop and ask** rather than accepting it.

| package | why | rejected alternative |
|---|---|---|
| `react-day-picker` | what the shadcn `calendar` is built on; no way to have the registry's calendar without it | a hand-written month grid — a solved problem, and it would not match the preset |
| `sonner` | what the shadcn registry generates for toasts today, styled by the preset | the deprecated registry `toast`, or a hand-rolled one that has to re-implement stacking, auto-dismiss and animation |

`sheet`, `popover`, `toggle-group` and `separator` are generated from the already-installed `radix-ui` umbrella and
add no dependency.

## Steps

### 1. Install the dependencies and generate the components

From `homework/`, with the CLI pinned to the version `specs/technical-stack.md` records:

```
pnpm add react-day-picker sonner
pnpm dlx shadcn@4.19.0 add sheet popover calendar toggle-group separator sonner -y < /dev/null
```

`< /dev/null` for the same reason as milestone 1: a new prompt must fail fast rather than hang.

Then, before writing any code:

- **Check what actually got installed.** `react-day-picker` v9 carries `date-fns` as its own dependency. If it lands
  in `node_modules`, that is fine and expected, but it must be recorded in `specs/technical-stack.md` (step 9) with
  the rule stated plainly: **no file under `src/` ever imports `date-fns`**, transitively present or not. Our date
  arithmetic stays in `src/lib/dates.js`. Verify with a grep at the end of the milestone.
- **Check `components.json` is still `"tsx": false`** and that the generated files are `.jsx`. A regression here
  poisons every component generated afterwards.
- Confirm `src/components/ui/` gained exactly the expected files and that nothing under it was hand-edited.
- Record the exact resolved versions for step 9.

### 2. jsdom polyfills in `src/test-setup.js`

`specs/technical-stack.md` predicts this and calls it expected rather than a bug. Radix's dialog, popover and
toggle-group reach for browser APIs jsdom does not implement. Add, in `src/test-setup.js` and nowhere else:

- `ResizeObserver` — a no-op class with `observe`, `unobserve`, `disconnect`
- `Element.prototype.scrollIntoView`
- `Element.prototype.hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`
- `window.matchMedia` is **not** added here: `src/lib/theme.js` deliberately takes an injectable `win`, and stubbing
  the global would undo that design. If a Radix component turns out to need it, pass a fake at the call site instead

Add each one only after seeing a test fail without it. A polyfill for an API nothing uses is dead weight that outlives
its reason.

### 3. `src/lib/format-dates.js` — the `Intl` layer, pure and tested first

Test-driven, and the first thing written. Pure functions, no React, no i18next: the language is an argument, exactly
as `src/lib/grouping.js` takes its locale.

- `formatFullDate(date, language)` — a calendar date to the long form the date button shows in daily view. Goes
  through `toLocalDate` from `src/lib/dates.js`, never `new Date(string)`
- `formatWeekRange(startDate, endDate, language)` — `Intl.DateTimeFormat(...).formatRange(a, b)`, which collapses the
  shared month and year on its own and does it differently per language, which is the whole point of using it
- `formatDayHeading(date, language)` — the weekday-and-day-number heading a weekly day block carries

Tests must cover, at minimum:

- English and French for each function, asserting the **literal expected strings**, not a regex that would pass on
  anything
- A week that crosses a month boundary and one that crosses a year boundary, through `formatWeekRange`
- 29 February 2028
- The negative-offset guard the testing section requires: `vi.stubEnv("TZ", "America/New_York")` and the same answers.
  This is the test that catches a `new Date("2026-08-24")` sneaking in, which renders as the previous day there

Note the risk: `Intl` output depends on the ICU data in the Node build. Pin the strings the local Node actually
produces, and if a string looks locale-data-fragile, assert on the parts that carry meaning rather than on the exact
spacing. Say in the summary which strings were pinned exactly.

### 4. `src/components/app-data.jsx` — the shared context

One context, per the technical stack's "no state management library: React hooks plus a single context for the
shared homework and course data". It goes in `src/components/` because it is our own component; the code layout in
the technical stack has no `context/` directory and this milestone does not add one.

Exports `AppDataProvider` and `useAppData`.

State it owns:

- `selectedDate` — a `YYYY-MM-DD` calendar date, initialised from `todayDate()`
- `view` — `"daily"` or `"weekly"`
- `courses`, `homework` — rows as `src/db/` returns them, column names untouched
- `loading`, `error`

What it deliberately does **not** own: **the language**. `useTranslation` already subscribes consumers to
`languageChanged`, and a second copy in the context would drift from `i18n.language`. The roadmap calls this out; do
not add it.

Behaviour:

- The visible range comes from the view: daily is `selectedDate` to `selectedDate`, weekly is `weekDays(selectedDate)`
  first to last. `listHomeworkBetween` is inclusive on both ends
- `listCourses()` returns **all** courses including archived ones. Archived courses must keep resolving, because a
  homework entry keeps displaying the real name of a course the user deleted. Filtering to active courses is the
  picker's job in milestones 7 and 9, not this layer's
- Switching view **keeps `selectedDate`**, which the functional specs require explicitly. Test it
- Previous/next step follows the view: `previousDay`/`nextDay` in daily, `previousWeek`/`nextWeek` in weekly — the
  helpers from `src/lib/dates.js`, never fresh arithmetic
- A **request sequence guard** on the load. Clicking next repeatedly fires overlapping reads, and an earlier one
  resolving last would paint stale data over fresh. Keep a counter in a ref, ignore a response that is not the
  latest. This is not concurrency anxiety about other processes — the project has none, this is one component racing
  itself
- A failed load sets `error` and does not blank the previous data
- Expose a `reload()` so milestones 7 to 9 can refresh after a mutation

Tests, with `@/db/courses` and `@/db/homework` faked at module level exactly as `src/db/*.test.js` already does
(`restoreMocks` and `clearMocks` in `vite.config.js` are what keep those fakes from leaking between tests):

- The daily range is one day, `from === to`
- The weekly range is Monday to Sunday of the week containing the selected date, seven days apart
- Switching view preserves the date, and re-queries with the new range
- Next/previous steps by one day in daily and by exactly seven days in weekly
- An out-of-order response does not overwrite a newer one
- A rejected read surfaces as `error` and leaves prior data alone

### 5. The top bar

`src/components/top-bar.jsx`, composed of small pieces in the same folder where they earn a file of their own.

Layout, left to right: previous button, the date selection button, next button, then the segmented Daily / Weekly
control, then the button that opens the side panel. Icons from `lucide-react`, which is installed.

- **The date button** shows `formatFullDate` in daily view and `formatWeekRange` in weekly view, and opens the
  `popover` holding the `calendar`
- **The calendar** must be given `weekStartsOn={1}`. Monday is hard-coded and never derived from the locale — the
  same rule `src/lib/dates.js` already follows, and the reason the weekly view must not reshape itself when the
  language changes. Check what `react-day-picker` v9 actually names this prop in the version installed, and check how
  it wants a locale; if localising the month and weekday names needs a `date-fns` locale object, that is the one
  place a `date-fns` import is acceptable, it goes in the component and nowhere else, and step 9 records the
  exception. If it can be avoided, avoid it
- Selecting a day gives back a `Date`. Convert it with `fromLocalDate` — **never** `toISOString().slice(0, 10)`,
  which answers yesterday before 01:00 in Paris. Then close the popover
- **The segmented control** is `toggle-group` with `type="single"`. Radix lets a single-type group be deselected by
  clicking the active item, which would leave `view` as `""` and render nothing: ignore an empty value rather than
  storing it. Test that clicking the already-active option leaves the view unchanged
- **Previous/next** call the context; their step follows the view. Their accessible names are translated
- The application name `Devoirs2mat` stays untranslated wherever it appears

### 6. The side panel

`src/components/side-panel.jsx`, built on the generated `sheet`.

- Hidden by default, opened from the top-bar button, dismissed with `Escape` or a click outside — Radix gives all
  three; do not re-implement them
- The main view keeps the full window width, which is what makes a sheet right and a permanent sidebar wrong
- Contents in this milestone: **the language switch only**. Two options, English and French, calling `setLanguage`
  from `src/i18n/preference.js`. That function already writes first and applies second, and already refuses an
  unsupported value — do not duplicate either check here
- A `setLanguage` that rejects must toast. It is a write that failed and the student cannot act on it where they are
- Leave a clearly marked place for milestone 7's course editor. A `separator` and nothing else; no placeholder text
  promising a feature

Tests: opens, closes on Escape, switching language calls `setLanguage` and the interface follows without a remount
(the existing `App.test.jsx` already demonstrates the assertion style for that last one).

### 7. Toasts, and the startup error this milestone owes

`sonner`'s `<Toaster />` mounted once, in `App`.

`App` still receives `startupError` as a prop — `main.jsx` resolves it before the first render and `boot.jsx` threads
it through. **Do not move it into the context.** The roadmap flags this exact refactor as how the wiring gets dropped,
and `src/boot.test.jsx` exists to catch it.

- `startupError !== null` raises an error toast saying the data could not be opened. Translated, in both catalogs
- **It fires twice under `StrictMode` in development**, which double-mounts effects. Dedupe it — a ref that survives
  the remount, keyed on the error identity, not a bare `useEffect` with an empty dependency array
- `main.jsx`'s `onLate` callback currently only logs a database error that arrives after the deadline. It must toast
  too. That path is reachable: a slow first-run migration that then fails. Route it through the same toast
- Replace the `console.error` in `App.jsx` with the toast, and update the comments in `App.jsx`, `boot.jsx`,
  `main.jsx`, `src/startup.js`, `src/db/client.js` and `src/i18n/preference.js` that all say "milestone 6 will turn
  this into a toast". They are correct today and become lies the moment this step lands — grep for `milestone 6`
  across `src/` and fix every hit

Tests: a startup error toasts; a clean startup toasts nothing; the toast fires once across a double-mount.

### 8. The main area

`src/components/daily-view.jsx` and `src/components/weekly-view.jsx`. Both render **structure only** in this
milestone — no cards exist yet — and both must already show the muted empty line the specs and the design guidelines
require, rather than nothing.

- The daily view is the day's list, grouped by course. With no homework it is the muted line
- The weekly view is seven day blocks, Monday to Sunday, laid out on **two columns**: Monday/Tuesday,
  Wednesday/Thursday, then **Friday alone in the left column with the right cell empty**, then Saturday/Sunday. This
  pairing is specified precisely and is the fiddly part; get it right here, with nothing in the blocks to distract
- A block **grows with its content and never scrolls on its own**. The page scrolls. No `overflow` on a block
- Days come from `weekDays(selectedDate)`, never from the data: a day with no homework still gets its block. That is
  already how `groupWeek` in `src/lib/grouping.js` behaves, and it is why the dates are passed to it
- Use `groupByCourse` and `groupWeek` from milestone 5 now, with empty homework lists. Wiring them here means
  milestone 8 adds a card component and nothing else
- Subtle appear animations per the design guidelines, using the `tw-animate-css` utilities the existing `App.jsx`
  already uses. Do not change any component's default sizes

Tests: seven blocks in Monday-to-Sunday order; the empty line appears in an empty day and in an empty daily view; the
Friday-alone pairing is asserted structurally, not by class name.

### 9. Specs, catalogs and roadmap

**Catalogs.** Delete the `shell.*` placeholder keys — the technical stack says only strings that actually exist
belong in the catalogs, and after this milestone that card is gone. Add the real keys in both `en.json` and `fr.json`.
`src/i18n/catalogs.test.js` enforces identical key sets recursively and will fail loudly on a French key forgotten.

**`specs/functional-specs.md`** — add the weekly date-button rule from decision 5: in weekly view the date selection
component shows the Monday-to-Sunday range of the selected week, formatted with `Intl`.

**`specs/technical-stack.md`**:

- `react-day-picker` and `sonner` in the dependency table with their resolved versions and the date
- The `date-fns` transitive note, with the rule that no file under `src/` imports it, and the calendar-locale
  exception if step 5 turned out to need one
- The jsdom polyfills now in `src/test-setup.js` and why each is there — that section currently *predicts* them
- The `sheet`-not-`drawer` decision and its reasoning
- The new generated components under `src/components/ui/`
- If the toast section or the "not bootstrapped yet" list drifted, fix it

**`plans/2026-08-23-roadmap.md`** — mark milestone 6 `done` in the table, point the plan-file column at this file, and
fix the stale "Milestone 5 is done but uncommitted" line in the status section: it is committed as `64ac491` and the
tree is clean.

**This file** — flip `Status:` to `done` when the last step lands.

## Definition of done

1. `pnpm test` passes and **exits**, from `homework/`
2. `cargo check` from `homework/src-tauri/` — expected to be untouched by this milestone; run it anyway and say so
3. `./scripts/dev-probe.sh` starts the real application and captures a screenshot. `pnpm dev` is not a substitute
4. **Hand-driven in `pnpm tauri dev`**, and this is the part that cannot be delegated to the suite: open the side
   panel and dismiss it with Escape and with an outside click; switch the language and watch the top bar follow
   without a restart; switch Daily/Weekly and confirm the date is preserved; step previous/next in both views and
   confirm the step is a day and then exactly seven days; open the calendar and pick a date, including one in another
   month; confirm the weekly layout puts Friday alone with the weekend paired
5. `grep -rn "date-fns" src/` returns nothing, or only the single documented calendar-locale import
6. `grep -rni "milestone 6" src/` returns nothing that still describes this work as future
7. The review round: this milestone touches user-visible behaviour and reads persistence, so **three** subagents
   (architecture, quality-engineering, adversarial) per `CLAUDE.md`, briefed to mutation-test and to report must-fix
   findings only, each with a reproduction and the smallest fix. Report findings split into fixed and deliberately
   not fixed. Never silently drop one, and do not start a second round unprompted
8. A plain statement of what was **not** verified. The dark palette is a known one: milestone 1 is still `approved`
   rather than `done` precisely because no human has seen it

## Known traps

Collected so they are not rediscovered one at a time:

- `toISOString().slice(0, 10)` on a picker's `Date` is the wrong-day bug milestone 5 exists to prevent. `fromLocalDate`
- Deriving the week start from the locale. Monday is hard-coded, in the picker as well as in `dates.js`
- Moving `startupError` into the context. `boot.test.jsx` guards it; do not make it pass by editing the test
- A Radix single-type toggle group deselecting to `""`
- `StrictMode` double-firing the startup toast in development
- Overlapping range loads resolving out of order
- Filtering archived courses out of the context. They must resolve, or an entry on a deleted course loses its name
- Putting the language in the context alongside `useTranslation`
- Hand-editing anything under `src/components/ui/`
- Re-running `shadcn apply --preset`, which overwrites the theme. `add` is what this milestone runs
