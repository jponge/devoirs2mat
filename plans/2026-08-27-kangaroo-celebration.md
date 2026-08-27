Status: done

# Kangaroo celebration and checkbox sounds

Celebrate finishing a day's homework with a brief kangaroo animation, anchored to the day that just got completed, in
both the daily and weekly views. Separately, play a soft, short sound whenever a homework checkbox is checked, and a
different one whenever it is unchecked.

This plan is self-contained: an agent starting cold should need only this file, `specs/` and `CLAUDE.md`. The visual
design (sprite shape, motion, colors, sizing) was validated with Julien across several rounds in a throwaway HTML/CSS
preview (not part of this repository) before this plan was written — the decisions below are the outcome of that
process, not a proposal still open for debate.

## Where this starts from

Milestones 0–11, packaging scripts and course colors are done. Relevant existing code:

- `src/components/course-group.jsx`'s `CourseGroup` is the one place both views' checkbox toggles go through. Its
  `toggle(item, checked)` function (around line 360) calls `setHomeworkDone`, then `reload()`. It already calls
  `useAppData()`, which exposes the full `homework` array for the visible range — everything due this week (weekly
  view) or this day (daily view), not just this course's own items.
- `src/components/daily-view.jsx` renders one `<section data-testid="day-list">` for the selected day.
  `src/components/weekly-view.jsx`'s `DayBlock` renders one `<section data-testid="day-block">` per day, seven of
  them. Neither carries a machine-readable date attribute today.
- `src/App.jsx`'s `App` component mounts `<Toaster>` as a permanent sibling of the main view, inside
  `AppDataProvider`. That is the established pattern for a single always-mounted overlay component.
- `src/components/side-panel.jsx` has three sections separated by `<Separator>`: language, `CourseEditor`,
  `BackupPanel`. No About section exists yet.
- `src/index.css` defines the shadcn `taupe` preset's tokens. Its `--primary` (`oklch(0.214 0.009 43.1)`, a near-black
  ink) and `--accent` (`oklch(0.96 0.002 17.2)`, a near-white muted tone) do **not** read as the warm illustrative
  brown the approved sprite design uses — confirmed by reading the file, not assumed. New tokens are needed; see
  decision 6.
- No hand-written `@keyframes` exist anywhere in this codebase yet. Every existing animation
  (`animate-in fade-in duration-300`, etc.) comes from `tw-animate-css`'s utilities. This feature is the first to need
  bespoke keyframes.

## Decisions taken with Julien on 2026-08-27

These are settled from the preview iteration. Do not reopen them.

1. **Trigger rule**: the celebration fires when checking a box makes every homework entry due that specific date
   complete (0 left for that date) — computed per-day, so it behaves identically in daily and weekly view. It does
   **not** fire on every checkbox, and does not require the whole visible range (day or week) to be complete.
2. **Re-trigger rule**: it fires every time the condition becomes true, with no persisted "already celebrated today"
   state. Check the last item, uncheck it, check it again — it fires twice. This is intentionally stateless: no new
   column, no new table, no settings row.
3. **Placement**: the sprite is anchored to the day block that just went to zero-left — near the day header in daily
   view, over that day's cell in weekly view — not a fixed screen corner and not a center-screen modal-like overlay.
4. **Sprite shape**: a real, correctly-proportioned side-profile kangaroo silhouette (a single fused path — see step
   4 for its exact source and license), not hand-drawn geometry. Three rounds of freehand SVG path-fitting were
   tried first and none of them read as a kangaroo; this is why the shape is sourced rather than authored here.
5. **Three gestures, chosen round-robin** (never the same one twice in a row): the shape is one fused path and cannot
   be cut into moving limbs, so each gesture is a combination of a whole-body motion and a small abstract accent
   near the sprite, not an animated arm or eye:
   - **Pop**: three staccato punchy bounces (squash/stretch) + three bold dots bursting outward, warm-colored.
   - **Nod**: three calm, decaying settles (slower, opposite energy from Pop) + three small sparkles twinkling in
     quick sequence, green-colored.
   - **Sway**: a continuous three-beat left-right rock (decaying amplitude) + three arcs sweeping past in one
     direction, blue-colored.
   All three read as clearly different from each other on rhythm, color and accent shape — this took several
   iterations to get right and is not incidental; do not simplify it back down to "one accent, three colors" or
   "one motion, three accents".
6. **Three new fixed colors**, deliberately outside the shadcn `taupe` palette (see decision in the questions Julien
   answered: "add as documented exception"). Exact values, light / dark:
   - `--celebration-warm`: `#a8703c` / `#d79a4d` — the silhouette's own fill, and Pop's burst dots (same color,
     these are not two separate tokens).
   - `--celebration-green`: `#4f7a6b` / `#7fb6a2` — Nod's sparkles.
   - `--celebration-blue`: `#3f6f92` / `#7fa8c9` — Sway's trail arcs.
   These names are deliberately not `--accent` or `--primary`: the shadcn preset already defines those with
   different meanings and different values, and reusing the names would silently shadow them.
7. **Sizing**: validated at roughly 15rem square in an isolated preview stage — that number is an artifact of the
   preview's own layout, not a value to hardcode. Pick a size that reads clearly anchored to a real day block (both
   the compact weekly-view cell and the roomier daily-view header) and adjust after seeing it live in
   `pnpm tauri dev`, in both views. Do not skip the manual check and just port 15rem verbatim.
8. **Sound**: synthesized with the Web Audio API, no bundled audio files, no new dependency.
   - On check: triangle wave, frequency ramping 660→880Hz over 90ms, short percussive envelope (near-instant attack
     to peak gain ~0.16, exponential decay finishing by ~120ms).
   - On uncheck: same shape, descending 520→400Hz.
   - Always on for now — no mute setting, no new `settings` row. This can be added later if it turns out to annoy
     someone; it is not being pre-built.
9. **Attribution → a new About section**, not an inline side-panel line and not a redraw. The source silhouette is
   licensed CC BY-SA 3.0 (also GFDL / Free Art License), which requires attribution reasonably visible to the end
   user. See step 4 for the exact credit text and step 8 for where the About section lives.

## Not in this milestone

- A mute toggle, or any `settings` table change for sound/animation preferences (decision 8).
- Keyboard or touch parity for the celebration — it is purely decorative (`aria-hidden="true"`, no focus target),
  the same treatment hover-revealed controls already get per `specs/functional-specs.md`. Do not "fix" this later
  as an accessibility bug; it was a deliberate call then and remains one now.
- Any general About/version screen. The About section added here carries exactly one thing: the attribution credit.
  Do not invent a version number or changelog to go with it.
- `prefers-reduced-motion` handling. Not asked for, not in `specs/design-guidelines.md` today; raise it separately
  if it turns out to matter, rather than folding it into this change.
- Reducing the gesture set back to one accent/one motion — decision 5 is deliberate, not a placeholder.

## Dependencies

None. No new Mise tool, pnpm package or cargo crate. The Web Audio API and inline SVG are both already available in
the webview; the sprite is hand-authored markup plus CSS, not an image asset.

## The sprite's source and license

The silhouette is **`Kangourou.svg`, by Lionel Allorge, on Wikimedia Commons**
(`https://commons.wikimedia.org/wiki/File:Kangourou.svg`), licensed CC BY-SA 3.0 / GFDL 1.2+ / Free Art License. It
is a single closed path, used with its fill color replaced (via CSS, not by editing the path data) and otherwise
unmodified in shape. The exact `d` attribute, exactly as published:

```
M 789.0868,676.97364 C 733.68418,671.14641 683.69548,662.60493 639.65583,638.85479 C 611.55364,623.6995 604.39664,601.8926 583.37903,559.56196 C 567.30778,527.1936 556.85431,494.55493 551.94841,461.42649 L 544.59782,411.78929 L 507.74388,389.04182 C 487.47421,376.53067 454.29109,350.08841 434.00346,330.28117 L 397.11692,294.26805 L 371.12168,307.52983 C 282.71745,352.63037 181.29552,374.21271 126.95909,359.48713 C 91.086081,349.76528 53.22223,315.30483 32.315561,273.35058 C 2.4975684,213.51367 13.433888,196.62314 47.727691,249.54748 C 59.384082,267.53635 80.68513,290.03958 95.06335,299.55463 C 161.6264,343.60398 260.9902,304.31678 345.04782,200.714 C 445.03695,77.475222 549.43912,36.387104 644.26724,82.954396 C 688.81678,104.83134 734.66483,145.03037 772.59739,195.47263 C 818.84469,256.97186 837.57816,266.81878 867.91115,245.57275 C 887.53803,231.82555 886.26757,227.66239 856.41711,207.90831 C 840.6704,197.48763 830.55133,185.76752 830.55133,177.95 C 830.55133,156.55304 854.60819,164.32425 893.82419,198.38938 C 905.50667,208.53742 921.51111,216.86867 929.38963,216.9032 C 937.26809,216.93767 956.35122,227.01193 971.7965,239.29041 C 987.24181,251.56882 1006.1562,263.57243 1013.8284,265.96495 C 1029.8525,270.96202 1037.237,280.18013 1037.3785,295.3625 C 1037.5292,311.52733 1021.2438,314.38588 990.70969,303.55425 C 972.71494,297.17077 952.98911,295.15803 934.01444,297.76917 C 908.42233,301.29101 902.57748,305.31758 885.5161,331.18065 C 862.92403,365.42753 814.24904,405.57573 793.60176,405.57573 C 783.24044,405.57573 783.45073,418.1586 759.90511,450.42938 C 717.7283,508.23559 695.45097,511.96847 670.93046,500.2161 C 661.00396,495.45841 651.82445,486.07295 650.53156,479.3595 C 648.50147,468.81808 650.98847,467.71466 668.76453,471.26985 C 695.99595,476.71613 712.62673,466.90932 719.41903,441.40011 C 730.91759,398.21576 700.54523,363.78196 665.17203,379.89903 C 631.032,395.45433 621.36731,445.3795 639.38948,513.0849 C 657.79756,582.24036 686.9097,603.96872 810.84232,641.05165 C 857.1753,654.91531 895.11373,668.44073 895.14993,671.10813 C 895.22779,676.84289 853.92686,683.7936 789.0868,676.97364 z
```

Its natural bounding box is roughly x:[2.5, 1037.5], y:[36.4, 683.8]. Every viewBox and coordinate below is expressed
in this same native coordinate space — no scaling transform is applied to the path itself, only to the SVG's own
`width`/`height` in CSS (decision 7).

**This path was extracted through an automated fetch of the Commons file, not a direct file download.** It rendered
correctly in the validated preview, but if it ever renders as a broken or self-intersecting shape, re-download it
directly from the URL above rather than assuming the geometry above is definitely byte-exact.

## Steps

Work test-first throughout.

### 1. `src/lib/celebration-colors.js` (new, or inline in `src/index.css`)

Add the three tokens from decision 6 to `src/index.css`, following the file's existing `:root` / `.dark` pattern
exactly (light values in `:root`, dark values in the same `.dark` block the rest of the palette uses):

```css
--celebration-warm: #a8703c;
--celebration-green: #4f7a6b;
--celebration-blue: #3f6f92;
```

and in the `.dark` block:

```css
--celebration-warm: #d79a4d;
--celebration-green: #7fb6a2;
--celebration-blue: #7fa8c9;
```

No new file needed for just three custom properties — add them as a clearly-commented group in `src/index.css`,
next to the existing palette, explaining in one line that these are celebration-only and deliberately not part of
the shadcn preset (cross-reference `specs/design-guidelines.md`, updated in step 9).

### 2. Bespoke keyframes in `src/index.css`

Add these `@keyframes`, commented as belonging to the kangaroo celebration feature specifically (this is the first
hand-written animation in the codebase — say so, since every existing one comes from `tw-animate-css`):

```css
@keyframes roo-pop { /* entrance: scale+fade in, small overshoot */ }
@keyframes roo-fade-out { /* exit: fade+drift up */ }
@keyframes roo-bounce-punchy { /* Pop's body motion: 3 staccato bounces w/ squash-stretch */ }
@keyframes roo-dip { /* Nod's body motion: 3 decaying calm settles */ }
@keyframes roo-sway { /* Sway's body motion: 3 decaying left-right rocks */ }
@keyframes accent-burst-dot { /* Pop's accent: scale up then fly outward via --dx/--dy custom properties, fade */ }
@keyframes accent-sparkle-pop { /* Nod's accent: scale+rotate in, hold, scale+rotate out */ }
@keyframes accent-trail-fade { /* Sway's accent: fade in, translate, fade out */ }
```

The exact percentage keyframe stops and transform values were tuned by eye across several iterations in the
preview; port them as validated rather than re-deriving from scratch — ask Julien for the preview's final CSS if it
was not carried over separately, since re-deriving the timing curves blind is exactly the "too subtle" / "doesn't
look right" trap the preview rounds existed to avoid.

**Two things that were hard-won and must not be lost when porting:**

- Amplitudes (`translateY`, accent `--dx`/`--dy`, dot radii) are sized for this path's own ~1000-unit coordinate
  space, not small CSS-pixel values. A `translateY(-12px)` that looks right in a 100-unit viewBox is nearly
  invisible here; the validated values are roughly 6× that scale (e.g. `-72px`/`-58px`/`-40px` for Pop's three
  bounce peaks).
- Any element that gets a CSS `transform` animation (the accents, the body-motion group) must **not** also carry a
  static SVG `transform="rotate(...)"` presentation attribute: an animated `transform` replaces that attribute
  outright rather than composing with it, silently discarding whatever resting tilt the attribute encoded. Any
  "resting" pose for an animated part is baked into the keyframe's own `0%`/`100%` values instead.

### 3. `src/lib/homework.js`

Add a pure predicate, next to the existing `validateHomeworkCourseId`:

```js
export function isLastUndoneForDay(dayItems, toggledItemId, checked)
```

`true` only when `checked === true` and every item in `dayItems` other than the one being toggled already has
`done === 1`. `dayItems` is the caller's responsibility to filter to one `due_date` — this function does not touch
dates itself. Test it directly: last item checked → `true`; a non-last item checked → `false`; any uncheck →
`false`; a day with only one item, checked → `true`.

### 4. `src/lib/celebration.js` (new, pure)

A minimal pub-sub, the same shape as `src/i18n/index.js`'s relationship to `languageChanged`, but local to this
module rather than riding on an existing event emitter:

```js
export function emitDayCompleted(date)          // notifies all current subscribers with `date`
export function onDayCompleted(callback)        // subscribes; returns an unsubscribe function
```

This is what lets `CourseGroup`'s `toggle()` — which only knows about one course's cards — announce a day-level
event without either component needing a reference to the other, and without threading a callback prop through
`DayBlock` → `WeeklyView`/`DailyView` → every `CourseGroup` instance for a day it doesn't otherwise touch. Test:
emitting calls every current subscriber with the right date; unsubscribing stops further calls; multiple
subscribers all fire.

### 5. `src/lib/sound.js` (new)

```js
export function playCheckSound(win = window)
export function playUncheckSound(win = window)
```

Takes `win` as an injectable dependency the same way `startSystemThemeSync` takes `win` — this is what lets a test
supply a fake `AudioContext` instead of reaching for a jsdom global that does not exist. Internally: a lazily-created
`AudioContext` (created once, reused — do not construct a new one per call), an `OscillatorNode` (`type: "triangle"`)
frequency-ramped per decision 8, and a `GainNode` shaping a fast-attack/short-decay envelope. Both functions must
**never throw** into their caller — wrap the body in `try/catch` and swallow failures silently (this is a decorative
cue, not a write the student needs to know failed; `specs/functional-specs.md`'s "a failure is never silent" rule is
about actions that changed or failed to change stored data, which this is not).

Test with a fake `win` exposing a minimal stub `AudioContext` (spy-able `createOscillator`/`createGain`/
`connect`/`start`/`stop`), asserting the right frequency values are set for check vs. uncheck, and that calling
either function when `win.AudioContext` and `win.webkitAudioContext` are both `undefined` does not throw.

### 6. `src/components/kangaroo-sprite.jsx` (new)

A small, purely presentational component:

```jsx
<KangarooSprite gesture="pop" | "nod" | "sway" playing leaving />
```

Renders the ground-shadow ellipse, the silhouette (the path from "The sprite's source and license" above, inside a
`<g class="silhouette-group">` so body-motion keyframes can target the group without touching sibling accents), and
the gesture's own three accent elements (step 2's per-gesture accent markup) inside a `<g class="accents">`. The
whole `<svg>` carries `aria-hidden="true"` (decision: purely decorative, matches "Not in this milestone"). `playing`/
`leaving` toggle the CSS classes that trigger the entrance/gesture/exit keyframes. No `useAppData()`, no `src/db/`
import — same "presentational, no context" rule `HomeworkEditForm` already follows.

Test: for each of the three `gesture` values, the right accent element count and class names are present; the
`aria-hidden` attribute is always present; toggling `playing`/`leaving` toggles the expected classes. jsdom runs no
CSS animation, so these tests assert markup and classes, never motion.

### 7. `src/components/celebration-layer.jsx` (new)

Subscribes to `onDayCompleted` once, on mount. On each event:

1. Picks the next gesture from a fixed cycling order (`["pop", "nod", "sway"]`), advancing a simple incrementing
   counter — **not** `Math.random`. Decision 5's "never the same one twice in a row" is a guarantee, not a
   probability, so a plain round-robin index is the correct tool, unlike `pickRandomCourseColor`'s genuine
   randomness for course color.
2. Looks up `document.querySelector('[data-day-date="${date}"]')` (steps 9–10 add this attribute) and reads its
   `getBoundingClientRect()`.
3. Adds an entry to local state (an array, not a single slot) holding `{ id, gesture, rect }` — an array because the
   weekly view can complete several different days close together, and decision 2/5 do not say only one celebration
   may be visible at a time.
4. Renders a `position: fixed` `<KangarooSprite>` per active entry, positioned from its stored `rect`, and removes
   that entry from state after the sprite's total lifecycle (entrance + hold + exit) has elapsed.

Test with `vi.useFakeTimers()`: emitting `onDayCompleted` (via `emitDayCompleted`, not by reaching into the
component) causes a sprite to appear; advancing time past its lifecycle removes it; two emissions in a row use two
different `gesture` values; a stubbed `getBoundingClientRect` on a test element with the matching `data-day-date`
drives the sprite's stored position. jsdom's default `getBoundingClientRect` returns all-zeroes — stub it explicitly
in the test rather than relying on that default meaning anything.

### 8. `src/App.jsx`

Mount `<CelebrationLayer />` once, as a sibling of `<Toaster>` — same "one always-mounted overlay" pattern, no props
needed since it drives itself entirely from `src/lib/celebration.js`.

### 9. `src/components/daily-view.jsx`

Add `data-day-date={selectedDate}` to the existing `<section data-testid="day-list">`.

### 10. `src/components/weekly-view.jsx`

Add `data-day-date={day.date}` to `DayBlock`'s `<section data-testid="day-block">` (pass `day.date` through as a new
prop if `DayBlock` does not already have convenient access to it — it does, via its existing `day` prop).

### 11. `src/components/course-group.jsx`

In `toggle(item, checked)`, before calling `setHomeworkDone`:

```js
const dayItems = homework.filter((entry) => entry.due_date === item.due_date);
if (isLastUndoneForDay(dayItems, item.id, checked)) {
  emitDayCompleted(item.due_date);
}
if (checked) {
  playCheckSound();
} else {
  playUncheckSound();
}
```

`homework` here is `CourseGroup`'s existing `useAppData()` value (the full visible-range array), not `group.homework`
(that group's own course-scoped subset) — using the narrower one would make every day look like it only ever has one
course's items in it. The sound call happens unconditionally on every toggle, independent of whether this was the
day's last item; the celebration only on the last-item case. Neither call should be awaited or block the existing
`setHomeworkDone`/`reload()` sequence — they are synchronous, fire-and-forget, and `playCheckSound`/
`playUncheckSound` already never throw (step 5).

### 12. `src/components/side-panel.jsx`

Add a new `<AboutSection>` (new small component or inline JSX), after `<BackupPanel>`, separated by another
`<Separator>`:

- A heading (`t("about.title")`).
- The credit line (`t("about.kangarooCredit")`), rendered as English text with an inline link to
  `https://commons.wikimedia.org/wiki/File:Kangourou.svg` (through `@tauri-apps/plugin-opener`, the same pattern
  `MarkdownLink` in `course-group.jsx` uses — do not open it in the application webview). The credit text must
  include the author's name ("Lionel Allorge") and the license ("CC BY-SA 3.0") — this is the actual license
  obligation, not decoration; do not shorten it to just a link.

### 13. Catalogs

New keys in both `src/i18n/en.json` and `src/i18n/fr.json`:

- `about.title` — "About" / "À propos".
- `about.kangarooCredit` — the credit sentence, phrased naturally in each language rather than word-for-word
  translated (the codebase's existing convention — see `catalogs.test.js`'s parity check, which only requires the
  same keys to exist, not the same wording).

No new keys are needed for the sprite itself (`aria-hidden`, nothing announced) or for the sounds (nothing visual or
textual to label).

### 14. Specs

- `specs/functional-specs.md`: under "What the application does in the main view", add a short paragraph describing
  the celebration (decisions 1–5, 7, in plain functional terms, not implementation detail) and a line under
  "Errors and feedback" or nearby noting the two checkbox sounds and that both are decorative and never block or
  represent a write failure.
- `specs/design-guidelines.md`: document the three new fixed tokens from decision 6 as a deliberate, bounded
  exception to the shadcn palette, and add a short clarifying note that the kangaroo/sound touches are wordless
  motion and sound cues, not the "mascot voice" the guidelines already rule out for copy — this is a scope
  boundary, not a reopening of that rule: it does not license adding jokes, exclamation marks or a mascot
  personality anywhere else.
- Add a line noting the About section's attribution requirement, so a future contributor knows *why* that credit
  line exists and must not be removed as clutter.

## Definition of done

- `pnpm test` passes.
- `pnpm build` is clean.
- `pnpm tauri dev` started and **actually exercised**: check the last remaining item of a day in the daily view and
  confirm a kangaroo appears anchored near it, plays one of the three gestures, and disappears after roughly its
  intended lifetime; repeat in the weekly view, including completing two different days close together to confirm
  both sprites show independently; check-uncheck-check the same last item and confirm it celebrates both times;
  confirm the gesture cycles across several completions without an immediate repeat; confirm the check and uncheck
  sounds are both audible, short, and clearly different from each other; confirm the About section shows the credit
  line and its link opens in the system browser, not the app window; confirm the new colors and the sprite look
  right in both light and dark system appearance.
- State plainly what was not verified — in particular, no automated test can confirm the motion "reads well" or that
  the sound is "discreet enough"; that judgment is the manual pass above, not something `pnpm test` proves.

## Known traps

- **jsdom runs no CSS animation.** Component tests assert classes and markup, never motion; timing-dependent
  behavior (auto-dismiss) is tested through `vi.useFakeTimers()`, not real elapsed time.
- **jsdom's `getBoundingClientRect` returns all zeros by default** — `celebration-layer.test.jsx` must stub it
  explicitly on the element carrying `data-day-date`, not rely on the default meaning anything.
- **An animated CSS `transform` replaces an element's static SVG `transform` attribute; it does not compose with
  it.** Any part that gets a keyframe animation must carry no `transform="rotate(...)"` of its own — bake the
  resting pose into the keyframe's `0%`/`100%` instead. This was the cause of a real, non-obvious bug in the preview
  iteration and will silently reappear if ported carelessly.
- **Amplitude values are scaled to this path's ~1000-unit coordinate space.** Small, "normal-looking" pixel values
  for a `translateY` or a `--dx`/`--dy` will render as barely-there — this was the single biggest source of "it's
  too subtle" feedback during preview iteration, twice.
- **Do not use `Math.random` for gesture selection.** Decision 5's "never twice in a row" is a hard guarantee from a
  cycling index, which `Math.random` cannot provide without extra bookkeeping to reject repeats — simpler to just
  not reach for randomness here at all.
- **`--celebration-warm`/`--celebration-green`/`--celebration-blue` are new names on purpose.** Do not shorten them
  to `--accent`/`--primary` etc. — those names are already taken by the shadcn preset with unrelated values, and
  reusing them would silently corrupt both this feature and the existing UI that already depends on them.
- **The sound functions must never throw into `toggle()`.** An `AudioContext` can be unavailable or blocked in ways
  that have nothing to do with whether the checkbox write itself succeeds; a thrown error here must not be allowed
  to prevent `setHomeworkDone`/`reload()` from running.
- **The credit text is a license requirement, not a nice-to-have.** Do not let it get simplified away as "just a
  link" or dropped from the About section during later cleanup.
