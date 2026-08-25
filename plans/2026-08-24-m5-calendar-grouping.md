Status: done

# Milestone 5 — Calendar and grouping helpers

Part of [the roadmap](2026-08-23-roadmap.md). Depends on nothing but the test tooling from milestone 2. Everything it
delivers is pure JavaScript in `src/lib/`: no UI, no database call, no new dependency.

## Context

This is where the wrong-day bugs live, and it is the part of the application genuinely worth test-driving. Milestones
6 to 9 all consume these helpers — the previous/next controls, the weekly day blocks, the course headings and their
ordering — so a mistake here is invisible in the helper and reappears as "my homework is on the wrong day" three
milestones later.

The specs already fix most of the behaviour.

`specs/functional-specs.md`:

> A due date is a calendar date, with no time and no time zone. It is stored as `TEXT` in `YYYY-MM-DD` form. Never use
> `Date` arithmetic or epoch milliseconds for it: that is how a homework item due on Monday ends up displayed on
> Sunday
>
> The week start is always Monday and is never derived from the locale […]
>
> Previous / next week shifts by exactly seven days, previous / next day shifts by one day and never skips weekends
>
> The current day is the local system date.

**The week itself changed with this milestone.** Julien decided on 2026-08-24 that Sunday gets a block of its own, as
the last day of the week, so the week runs Monday to **Sunday** and the weekly view shows **seven** blocks. The spec
still says six, and rewriting it is step 3 below. Everything quoted above survives unchanged.

`specs/data-model.md` fixes the ordering:

> Homework inside a day-and-course group: `ORDER BY created_at, id`. Completion never reorders anything, so `done`
> must not appear in any `ORDER BY`
>
> Courses: alphabetically, but sorted in JavaScript with `localeCompare` […] Archived courses sort after active ones
>
> Days in the weekly view come from the date range, not from the data: a day with no homework still shows its block

`specs/technical-stack.md` fixes how they are tested: `TZ` is pinned to `Europe/Paris` in `vite.config.js`,
deliberately not UTC, precisely so this milestone's tests can catch what a UTC pin would hide; and date helpers take
an explicit "today" argument rather than reading the clock, the same way `startSystemThemeSync` takes `win`.

The database layer these helpers feed on already exists: `listHomeworkBetween(from, to)` returns rows with
`{ id, text, due_date, course_id, done, created_at }` already ordered by `created_at, id`, and `listCourses()` returns
`{ id, name, archived_at, created_at }` in insertion order, unsorted by name on purpose — `src/db/courses.js` says so
in a comment that points at this milestone. A weekly fetch is now `listHomeworkBetween(monday, sunday)`, which covers
all seven days: no homework is ever unreachable from the weekly view.

## Decisions taken with Julien before writing this

1. **The week is Monday to Sunday, seven blocks.** Sunday is the last day of the week that began the Monday before it,
   so `weekStart("2026-08-23")` — a Sunday — is `2026-08-17`, and `weekDays` returns seven dates. This **supersedes**
   an earlier answer in this same conversation that placed Sunday in the *following* Monday-to-Saturday window; that
   arrangement existed only to give a Sunday somewhere to belong when it had no block, and a seven-day week removes
   the problem rather than working around it. The selected date is now always one of the blocks on screen, whatever
   it is.
2. **The two-column layout pairs the weekend.** Monday and Tuesday, then Wednesday and Thursday, then Friday alone,
   then Saturday and Sunday. Building that grid is milestone 8's work; this milestone only writes it down, because it
   is the sentence in the spec that the seven-day week invalidates.
3. **`localeCompare` takes an explicit locale argument**, threaded from the active language by the callers in
   milestones 7 and 8. It keeps the helper pure and makes the ordering tests independent of the host machine's locale.
4. **Two modules**, `src/lib/dates.js` and `src/lib/grouping.js`, each with a colocated `*.test.js`, matching the
   scope of the existing `instants.js` and `theme.js`.
5. **Malformed input throws.** A calendar date that is not exactly `YYYY-MM-DD` and a real date is a programming
   error, never user input: `due_date` is guarded by a `CHECK` constraint in the database and every producer is our
   own code. Throwing surfaces the bug where it is made instead of letting a plausible-looking wrong date reach a
   view.

## Dependencies

**None**, and explicitly no date library. `react-day-picker`, which any shadcn calendar or date picker would pull, is
a milestone 6 conversation and is not approved by this plan.

## Steps

Each step is tests first, then the implementation. No step needs the application to run.

### 1. `src/lib/dates.js` — validation and the arithmetic core

Exported surface:

| function | contract |
|---|---|
| `isCalendarDate(value)` | `true` for a string that is exactly `YYYY-MM-DD` *and* a real date. Never throws |
| `addDays(date, count)` | calendar date shifted by an integer number of days, positive or negative |
| `nextDay(date)` / `previousDay(date)` | `addDays(date, ±1)` |
| `nextWeek(date)` / `previousWeek(date)` | `addDays(date, ±7)` — exactly seven days, never "the same weekday next month" |
| `weekStart(date)` | the Monday of the week containing `date`; for a Sunday, the Monday six days earlier |
| `weekDays(date)` | seven calendar dates, Monday to Sunday, of the week containing `date` |
| `todayDate(now = new Date())` | the **local** system date as `YYYY-MM-DD` |
| `fromLocalDate(date)` | the calendar date a `Date` falls on **locally** — the way back in, for a date picker |
| `toLocalDate(date)` | a `Date` at local midnight, for handing to `Intl` in a later milestone |

Everything that takes a calendar date validates it and throws `Error` with the offending value in the message.
`addDays` also throws on a non-integer `count`.

Added during the review round, not in the original draft: `fromLocalDate`, so that milestone 6's date picker has a
supported way back from a `Date` and never improvises `picked.toISOString().slice(0, 10)` — which is the wrong-day bug
itself. `todayDate` is now `fromLocalDate(now)`. The accepted range is year 1 to year 9999 and a shift that leaves it
throws `calendar date out of range`: the set of dates the module accepts is exactly the set it can produce, so no
helper can return a string it would refuse as input.

Notes on the implementation, because two of these are the exact traps the specs warn about:

- **`todayDate` uses the local getters** — `getFullYear`, `getMonth`, `getDate` — and never `toISOString()`. Under
  `TZ=Europe/Paris`, `new Date(2026, 7, 24, 0, 30)` is `2026-08-23T22:30Z`, so a UTC round-trip yields *yesterday*.
  That is the wrong-day bug, and it has a test.
- **`toLocalDate` is `new Date(year, month - 1, day)`** and never `new Date("2026-08-24")`, which the language parses
  as UTC midnight and which therefore renders as the previous day in any negative-offset zone. It exists so that
  milestones 6 and 8 have one obvious way to format a calendar date with `Intl`, rather than each inventing one.
- **The weekday is derived from the date, never from the locale.** `weekStart` computes it from the UTC epoch day and
  maps Monday to 1, so no `Intl` API and no locale is consulted anywhere in the module — that is what keeps the weekly
  view from reshaping itself when the user switches language.
- Comparing two calendar dates needs no helper: `"2026-08-24" < "2026-08-25"` is correct for this format, and a
  comment in the module says so, so nobody adds one.

**The day shift uses `Date.UTC`, not hand-rolled civil arithmetic.** Decided on 2026-08-24. The internal shift is
`setUTCFullYear(…)` on a zero epoch, the ±`count` days added in milliseconds, and the components read back with the
`getUTC*` getters — all inside one private function that nothing else in the code base calls. UTC has no DST, so every
day there is exactly 86 400 000 ms long and the arithmetic cannot cross a zone boundary; the bug the specs warn about
is a property of *local* time, which this never touches. The alternative — the days-from-civil algorithm, no `Date` at
all — is about fifteen lines of modular arithmetic with constants nobody on this project will re-derive while reading
a diff, and it would make us own leap-year logic that the platform already gets right. The DST tests below are the
real guard under either implementation.

`Date.UTC` has exactly one trap and this is where it is paid: **`Date.UTC(99, 0, 1)` means 1999**, because years 0 to
99 are remapped onto 1900. Our format accepts `0099-01-01` and an import can carry one, so the shift is built with
`setUTCFullYear(year, month - 1, day)`, which has no such remap, rather than with the `Date.UTC(…)` constructor form.
A test pins a year below 100.

Tests (`src/lib/dates.test.js`), the edge cases the roadmap requires plus the ones this stack adds:

- month boundary: `2026-01-31 → 2026-02-01`, and back
- year boundary: `2026-12-31 → 2027-01-01`, `2026-01-01 → 2025-12-31`
- 29 February: `2028-02-28 → 2028-02-29 → 2028-03-01`, and `2026-02-28 → 2026-03-01` in a non-leap year
- **the two Europe/Paris DST transitions**, `2026-03-29` and `2026-10-25`. `previousDay("2026-10-26")` and
  `nextDay("2026-10-25")` are the assertions that fail loudly under an implementation that adds 86 400 000 ms to a
  local `Date`: the October transition makes that land at 23:00 on the *same* calendar day
- `nextWeek` / `previousWeek` are exactly ±7 days, including across a month, a year and a DST transition
- `weekStart` returns the same Monday for each of the seven days Monday through **Sunday**, and the previous Monday
  for the Monday before that. The Sunday case is its own test: it is the day the previous rule got backwards
- `weekDays` returns seven entries, consecutive, Monday first and **Sunday last**; across a month boundary
  (`2026-08-31 … 2026-09-06`) and a year boundary (`2026-12-28 … 2027-01-03`)
- Monday is hard-coded, not derived: the first entry of `weekDays` is a Monday and the last a Sunday, asserted
  through `toLocalDate(...).getDay()`, and no function in the module takes a locale
- every date belongs to the window it selects: `weekDays(d)` contains `d`, for each of the seven weekdays. That is the
  property the six-day week could not satisfy, and it is worth pinning as a property rather than as one more example
- a year below 100 survives the round trip: `nextDay("0099-12-31") === "0100-01-01"`, which the `Date.UTC(…)`
  constructor form silently answers `2000-01-01` to
- `todayDate` at local `00:30` on `2026-08-24` (summer) and on `2026-01-15` (winter) returns that same day, which is
  the assertion a `toISOString()` implementation fails; single-digit months and days are zero-padded
- rejected inputs, each throwing: `"2026-8-1"`, `"2026-08-1"`, `"26-08-01"`, `"2026-13-01"`, `"2026-00-10"`,
  `"2026-08-32"`, `"2026-02-30"`, `"2027-02-29"`, `"2026-08-24T00:00:00Z"`, `""`, `"oops"`, `null`, `undefined`, and a
  `Date` object. `isCalendarDate` returns `false` for the same set without throwing, and `true` for `"2028-02-29"`

### 2. `src/lib/grouping.js` — courses and groups

Exported surface:

| function | contract |
|---|---|
| `compareCourses(a, b, locale)` | active before archived, then `name.localeCompare(other, locale)`, then `id` |
| `sortCourses(courses, locale)` | a new sorted array, input untouched |
| `groupByCourse(homework, courses, locale)` | `[{ course, homework: [...] }]` |
| `groupWeek(homework, courses, dates, locale)` | `[{ date, groups }]`, one entry per date in `dates`, in order |

`groupByCourse` returns a group **only for courses that have entries** — a course heading with no cards underneath it
is not a thing the functional specs describe. Days are the opposite: `groupWeek` emits one entry per date it is given,
including days with `groups: []`, because "days in the weekly view come from the date range, not from the data". The
empty-day muted line is milestone 8's job; this helper just makes sure the day is there to render.

`groupWeek` takes the dates rather than deriving them, so it is indifferent to how long a week is. Nothing in this
module knows that a week has seven days, which is why the change Julien asked for touches `dates.js` and the specs,
and leaves grouping alone.

`course` in a group is the row as it came from `src/db/courses.js`, `archived_at` included, so that milestone 8 can
mute an archived course's name without a second lookup.

A homework row whose `course_id` matches no course **throws**. Invariant 1 of the data model says it cannot happen —
the foreign key is enforced by sqlx and an import is a single transaction — so if it ever does, something is wrong
that silently dropping the entry would hide.

`groupWeek` ignores an entry whose `due_date` is not in `dates`. The range query and the day list both come from the
same `weekDays` call, so it cannot normally happen; it is not worth a throw.

Tests (`src/lib/grouping.test.js`):

- `Éducation physique` sorts before `Zoologie`, with a second assertion that plain `<` gets it wrong — that is the
  whole reason the spec forbids SQL `ORDER BY` here, and it keeps the test from passing for the wrong reason
- the locale argument actually reaches `localeCompare`: `Ärger` before `Zoologie` under `"fr"`, after it under `"sv"`
- an archived course sorts after every active one even when its name would come first alphabetically
- archived courses are ordered alphabetically among themselves
- an active and an archived course sharing a name keep a stable order, by `id`
- entries inside a group follow `created_at`, then `id` when `created_at` is equal
- **`done` reorders nothing**: flipping `done` on the first entry of a group leaves the order byte-identical, and a
  completed entry still appears in its group
- a course with no entries produces no group; an entry whose `course_id` is unknown throws
- `groupWeek` returns exactly the days it was given, in order, empty ones included, with each entry filed under its
  `due_date` — exercised with the seven days a week now has, and with a shorter list to show it does not care
- `sortCourses` does not mutate its argument

### 3. Specs and roadmap updated in this same change

The seven-day week makes three sentences wrong, and they are corrected here rather than left to milestone 8:

- `specs/functional-specs.md`, **Dates** section: "The week runs from Monday to **Sunday**", and "The weekly view
  shows **seven** day blocks, Monday to Sunday". The Monday-start rule, the ±7-day step and the never-skip-weekends
  rule are unchanged and stay as they are.
- `specs/functional-specs.md`, **Dates** section, the `Date` arithmetic sentence. It currently reads "Never use
  `Date` arithmetic or epoch milliseconds for it", which forbids the implementation decided above. It came from the
  spec review of 2026-08-21 rather than from a product decision, and the hazard it names is real but narrower than
  its wording: it becomes "Never do the arithmetic in local time and never store a due date as epoch milliseconds —
  a day is not always 86 400 000 ms long once a daylight-saving transition falls inside it, which is how a homework
  item due on Monday ends up displayed on Sunday. `src/lib/dates.js` shifts days in UTC, where it always is, and
  reads the local clock only to answer what today is."
- `specs/functional-specs.md`, the **two columns** sentence: Monday and Tuesday, then Wednesday and Thursday, then
  Friday, then Saturday and Sunday. Friday is alone on its row and Sunday sits beside Saturday.
- `plans/2026-08-23-roadmap.md`, lines describing milestone 5 ("the Monday-to-Saturday window") and milestone 8 ("the
  weekly view's six Monday-to-Saturday blocks"). It is a plan and not a spec, but milestone 8 will be planned from it
  and would inherit the wrong week.

`specs/data-model.md` needs nothing: it says days come from the date range, which is true at any length.
`specs/technical-stack.md` needs nothing beyond naming the two new modules if its `lib/` sentence reads short.

## Verification

1. `pnpm test` from `homework/` — passes and exits. The suite is at 121 tests today; this milestone adds roughly
   forty and every one of them must be falsifiable, not a restatement of the implementation
2. `pnpm build` from `homework/` — still succeeds
3. `./homework/scripts/dev-probe.sh` — the application still starts. There is **no screen to exercise**: this
   milestone ships no UI, and nothing imports these modules yet. That is stated rather than dressed up
4. `cargo check` is not required — no Rust is touched
5. The three `general-purpose` review subagents (architecture, quality engineering, adversarial) before asking for
   review, with findings reported split into fixed and deliberately not fixed

## Not in this milestone

- any component, any rendering, any `Intl` formatting of a date beyond `toLocalDate` handing one over
- the two-column grid itself, including how Friday behaves alone on its row: written down here, built in milestone 8
- any catalogue key: nothing here produces a user-visible string
- any change to `src/db/` — the helpers consume its rows and add no query
- a date picker or a calendar component, and the dependency that would come with it

## Definition of done

- `pnpm test` and `pnpm build` pass
- every edge case listed in step 1 and step 2 is covered by a test that fails if the behaviour is inverted
- `weekDays` returns seven days, Monday to Sunday, and every date belongs to the week it selects
- `specs/functional-specs.md` describes the seven-day week and the weekend-paired layout, and the roadmap no longer
  says Monday-to-Saturday anywhere
- the `Date` arithmetic sentence in `specs/functional-specs.md` matches what `src/lib/dates.js` actually does
- no new dependency was added
- what was not verified is stated plainly

## Outcome (recorded 2026-08-25)

Written test-first, then reviewed by three subagents; the quality-engineering and adversarial ones were killed mid-run
by a session limit and re-run afterwards. The suite went from 121 to 189 tests. No new dependency, no UI, no change to
`src/db/`.

### Delivered

`src/lib/dates.js` and `src/lib/grouping.js` with the contracts in the tables above, plus `fromLocalDate`. The week is
Monday to Sunday, seven blocks, Sunday closing the week that began the Monday before it; `specs/functional-specs.md`
and the roadmap were rewritten accordingly and no longer say Monday-to-Saturday anywhere.

### Fixed in response to the reviews

- **The suite was structurally blind to the bug this milestone exists to prevent.** Replacing every `getUTC*` in the
  private `format` and `weekday` helpers with the local getters left all 54 tests green — because Europe/Paris is a
  *positive* offset, where UTC midnight always falls on the same local calendar day. Under `America/New_York` that
  same mutation is an off-by-one-day and an off-by-a-whole-week. `specs/technical-stack.md` claimed the Paris pin
  caught this class of bug; it does not, it now says so, and each date helper is asserted under a stubbed
  negative-offset zone. This is the finding that justified the review round.
- **`compareHomework` was not an ordering.** An entry with a missing `created_at` made it answer `1` in both
  directions, and `sort` then moved its *valid* neighbours — output depended on input order. Reachable as soon as a
  row is built in memory before a refetch lands.
- **The id tiebreak evaporated silently** on a non-numeric id: `a.id - b.id` is `NaN`, which `Array.prototype.sort`
  reads as `0`. The "stable order when an archived course shares its name with its replacement" promise was not being
  kept. Both comparators now go through `compareIds`.
- **Helpers could return a date they would refuse as input** — `weekStart("0000-01-01")` gave `"00-1-12-27"`,
  `addDays("9999-12-31", 1)` gave an eleven-character string that violates invariant 3 of the data model and would
  reach a `BETWEEN` query as an empty range. The accepted range is now year 1 to year 9999 at both ends.
- **`fromLocalDate` added.** There was no supported way back from a `Date`, so milestone 6's date picker was set up to
  improvise `picked.toISOString().slice(0, 10)` — the wrong-day bug itself.
- **`groupWeek` validated nothing about `dates`** while `dates.js` throws on the same input: the two modules
  disagreed at their own seam, and `undefined` would have reached a day heading.
- **`specs/data-model.md` contradicted the code and the functional specs** — "never convert one to UTC, never build it
  from a `Date`" — after the arithmetic decision was taken. Two source-of-truth documents disagreeing is what
  `CLAUDE.md` forbids.
- Test hygiene: two unfalsifiable `expect(weekDays.length).toBe(1)` arity assertions deleted, a self-referential
  `toLocalDate` oracle replaced with a direct `Date` check, and coverage added for malformed input to every helper,
  argument non-mutation, the error-message contract, the century leap rule, and `groupWeek` threading its locale.

### Deliberately not fixed

String `course_id` missing an integer `Map` key, a non-string `course.name`, duplicate dates in `groupWeek`, an
`isArchived` predicate, and empty/single-element collection tests: each is unreachable through `src/db/`, and
coercing at these boundaries would hide a future bug rather than surface it. One orphan entry throwing for the whole
week rather than one day block is real, and is milestone 8's error-boundary decision to make.

### Not verified

No screen was exercised: nothing imports these modules yet. `cargo check` was not run — no Rust was touched.

### Carried forward

- Milestone 6's date picker must go through `fromLocalDate` and never `toISOString().slice(0, 10)`.
- Milestone 8 owns the two-column grid, Friday in the left column with the right-hand cell empty, and decides whether
  an unknown-course throw takes down the week or one day block.
