Status: done

# Milestone 8 — Displaying homework

## Scope

Render the homework card inside `src/components/course-group.jsx`, where a placeholder `<li
data-testid="homework-item">` already exists. This is display only:

- an always-visible checkbox that writes completion immediately
- the Markdown text, restricted to the inline subset, rendered identically in the daily view and every
  day block of the weekly view because both go through this one component
- links open in the system browser through `@tauri-apps/plugin-opener`, guarded by a scheme allow-list,
  never `node.properties.href`

Out of scope, because they belong to milestone 9: the hover-revealed edit and delete buttons, the
quick-add affordance, and anything that writes `text`, `due_date` or `course_id`. The only write this
milestone makes is `setHomeworkDone`.

## Decisions settled with Julien before writing this

**The "literal characters" line in `specs/functional-specs.md` is wrong and gets corrected in this
change.** Julien's words: "Just render Markdown as it gets typed." Concretely: `react-markdown` with
`allowedElements` restricted to the inline subset and `unwrapDisallowed={true}`. A heading, list,
image, table or raw-HTML construct is never given special rendering; it degrades to its own inline
children (so `# Devoir` shows as `Devoir`, not `# Devoir`) rather than being dropped outright or
reproduced byte-for-byte. No custom remark plugin, no new dependency beyond `react-markdown` and
`remark-gfm`, and no line-start-escaping preprocessor. `specs/functional-specs.md`'s Markdown paragraph
gets reworded in this change to say exactly that, replacing:

> anything outside the supported subset is displayed as the literal characters the student typed

with:

> anything outside the supported subset is unwrapped to plain text — `react-markdown`'s own
> `allowedElements` restriction, not a bespoke fallback

**An entry with empty text shows just the checkbox.** No placeholder line, no new copy for that case.
The design guideline about an empty area needing a muted line is about a day block or the daily view
having nothing due, not about one card's text field being blank.

## What "just render Markdown" resolves technically

- `allowedElements`: `["p", "strong", "em", "code", "del", "a"]`. `del` is what `remark-gfm`'s
  strikethrough (`~~text~~`) maps to; strikethrough is GFM, not core CommonMark, which is why
  `remark-gfm` is needed at all — checked against the installed `react-markdown`'s dependency tree
  rather than assumed, per the roadmap's instruction to verify.
- `unwrapDisallowed={true}` so a heading/list/blockquote/table keeps its inline children instead of
  vanishing.
- Raw HTML: neither `rehype-raw` nor `allowDangerousHtml` is set, so react-markdown's own default
  applies — an `html` mdast node is dropped by `mdast-util-to-hast` with no fallback text. This is the
  library's ordinary behaviour, not something this milestone builds around. A test pins down what is
  actually observed once `react-markdown` is installed, rather than assuming.
- CommonMark autolinks (`<https://example.com>`) are core syntax, not GFM, and already produce a real
  `link` node — nothing extra needed for those to work.
- Text may contain more than one paragraph (a blank line splits it); nothing in this milestone collapses
  that. `react-markdown` renders one `<p>` per paragraph, both allowed.

### Link handling

`components={{ a: MarkdownLink }}` on the `ReactMarkdown` element. `MarkdownLink` reads `href` from its
own props — the value react-markdown already ran through its own default URL transform — and never
reaches into `props.node.properties.href`, so that transform is never bypassed. On top of that, a new
pure helper does the scheme allow-list:

`src/lib/markdown-links.js` (new file, pure, tested directly — matches how `src/lib/courses.js` holds
`validateCourseName` ahead of any write):

```js
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

export function isAllowedLinkScheme(href) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(href ?? "");
  return match !== null && ALLOWED_LINK_SCHEMES.includes(match[1].toLowerCase() + ":");
}
```

`MarkdownLink` renders a real `<a>` with an `onClick` that calls `event.preventDefault()` then
`openUrl(href)` (from `@tauri-apps/plugin-opener`, already a dependency) when
`isAllowedLinkScheme(href)` is true. A failed `openUrl` call reports through `onError(failure, "link")`
(see below). When the scheme is not allow-listed, `MarkdownLink` renders only `children` — no anchor,
no click handler, no silent dead link.

## Where the card lives

`CourseGroup` (in `course-group.jsx`) grows a per-item card, replacing the `{/* Milestone 8: the
card. */}` placeholder inside the existing `<li data-testid="homework-item">`. It keeps its own
`useAppData()` call for `reload`, exactly like `CourseEditor` already does — `CourseGroup` becomes the
one place that knows how to write `done` and re-fetch, so `DailyView` and every day block of
`WeeklyView` stay simple callers, which is the point of "one component used identically by both views."

Card contents: the shadcn `Checkbox` (new — see dependencies) bound to `item.done === 1`, and the
rendered Markdown next to it. When `item.done === 1`, the text container carries
`text-muted-foreground line-through`; the checkbox itself just shows checked. Nothing reorders or
removes the `<li>` — `done` still appears in no comparator, unchanged from milestone 5's grouping code.

`onError` is a new prop on `CourseGroup`, `DailyView` and `WeeklyView` (default a no-op, matching
`CourseEditor`/`SidePanel`'s existing convention), threaded from `App.jsx`:

```
App → MainView → DailyView/WeeklyView → CourseGroup → (checkbox write, MarkdownLink)
```

`App.jsx` gets a new callback next to the existing `reportWriteFailure`:

```js
const reportHomeworkFailure = useCallback(
  (failure, kind) => {
    toast.error(t(kind === "link" ? "errors.linkFailed" : "errors.saveFailed"));
    console.error("a write failed", failure);
  },
  [t],
);
```

This is deliberately **not** a reuse of `reportWriteFailure`: that function is hardcoded to
`errors.languageFailed` today, and every existing caller (the language switch, course create/rename/
archive) already goes through it with that one fixed message — a pre-existing rough edge, not something
this milestone touches. Reusing it for homework writes would compound the mismatch with a third failure
type showing the wrong text. Left alone here; worth a look in milestone 11's polish pass.

`WeeklyView`'s `DayBlock` also gains `onError`, passed straight through to each `CourseGroup` it
renders.

## Dependencies to approve

| what | version | why | rejected alternative |
|---|---|---|---|
| `react-markdown` | `^10.1.0` | Renders Markdown to React elements (not an HTML string), which is what makes `dangerouslySetInnerHTML` unnecessary — already the plan in `specs/technical-stack.md`, just not installed yet. Peer dep is `react >= 18`, fine on React 19. | Hand-rolling inline Markdown parsing — rejected because emphasis/link edge cases (nesting, escaping) are exactly what a maintained parser gets right and a regex-based one gets subtly wrong. |
| `remark-gfm` | `^4.0.1` | Strikethrough (`~~text~~`) is GFM syntax, not core CommonMark — confirmed by checking, not assumed. `remark-gfm` also brings tables/autolinks/task-lists, but `allowedElements` filters those out; they never reach the DOM. | Regex substitution for `~~text~~` → `<del>` — rejected for the same reason as above, plus it would run outside the parser's escaping rules. |
| shadcn `checkbox` (generated file, no new npm package expected) | via `pnpm dlx shadcn@latest add checkbox -y < /dev/null` | No checkbox component exists yet (`src/components/ui/` currently has button, card, sheet, popover, calendar, toggle, toggle-group, separator, sonner, input, alert-dialog). Built on the `radix-ui` umbrella already installed, so this should add zero new packages — verified with a `package.json` diff before treating that as fact, per the standing rule to stop and ask if the CLI pulls in anything unnamed. | Hand-writing a checkbox with a plain `<input type="checkbox">` — rejected because it would ignore the preset's look, which `specs/design-guidelines.md` says to respect. |

## New i18n keys

Added to both `en.json` and `fr.json` (the catalog-parity test enforces identical key sets):

```json
"homework": {
  "empty": "…unchanged…",
  "toggleDone": "Mark as done"
},
"errors": {
  "…unchanged…": "…",
  "saveFailed": "Couldn’t save your change.",
  "linkFailed": "Couldn’t open that link."
}
```

French (tu form, typographic apostrophe):

```json
"homework": {
  "toggleDone": "Marquer comme fait"
},
"errors": {
  "saveFailed": "Impossible d’enregistrer ta modification.",
  "linkFailed": "Impossible d’ouvrir ce lien."
}
```

`toggleDone` is the checkbox's `aria-label`, the same generic label on every card — matching the
existing pattern of simple, non-per-item labels elsewhere in the top bar. Screen-reader parity for a
long list of identically-labelled checkboxes is not something this milestone solves; it is not asked
for.

## Spec updates in this change

- `specs/functional-specs.md`: reword the "literal characters" sentence as described above.
- `specs/technical-stack.md`: append `checkbox` to the list of generated shadcn components, and add a
  "Versions resolved on 2026-08-26" line for `react-markdown` and `remark-gfm` once their exact resolved
  versions are known, matching the existing convention for every other dependency table in that file.

## Test plan (test-first)

### `src/lib/markdown-links.test.js` (new)

- accepts `http:`, `https:`, `mailto:`, case-insensitively (`HTTPS://example.com`)
- rejects `javascript:`, `data:`, `file:`, `ftp:`, `tel:`
- rejects a schemeless string (`"not a url"`) and `undefined`

### `src/components/course-group.test.jsx` (extend)

Keep the two existing tests. Add, rendered standalone where possible and wrapped in
`AppDataProvider` (mocking `@/db/courses` and `@/db/homework`, same style as
`course-editor.test.jsx`) where a write is involved:

- a checkbox is present, unchecked when `done: 0`, checked when `done: 1`
- bold, italic, inline code and strikethrough each render as their real element (`strong`, `em`,
  `code`, `del`)
- an unsupported construct (a heading line, a list item line) renders its text with no heading/list
  element — pin down the *actual* observed text (per the "unwrap" decision above)
- raw HTML in the text (`<b>bold</b>`) — pin down whatever `react-markdown` actually does by default,
  rather than assuming
- a link with an allowed scheme renders with `role: "link"`; a link with a disallowed scheme does not,
  but its visible text stays
- a completed item (`done: 1`) has `text-muted-foreground line-through` on its text container; a
  pending one does not
- empty `text` renders only the checkbox — no stray empty paragraph
- clicking the checkbox calls `setHomeworkDone(item.id, true)` (or `false` when unchecking), then
  triggers a reload (observed the same way `course-editor.test.jsx` does: a mocked list function's call
  count increasing)
- a rejected `setHomeworkDone` calls `onError(failure, "save")`
- clicking an allowed link calls `openUrl(href)` (mock `@tauri-apps/plugin-opener`) and does not navigate
- a rejected `openUrl` calls `onError(failure, "link")`

### `src/App.test.jsx` (extend)

One integration test wiring the whole chain: seed `listHomeworkBetween` with one item, make
`setHomeworkDone` reject, click its checkbox, assert `en.errors.saveFailed` toasts. This is what catches
a dropped `onError` prop somewhere in the four-file chain — the same reasoning `boot.test.jsx` already
applies to `startupError`. Requires adding `setHomeworkDone` to that file's existing
`vi.mock("@/db/homework", …)`.

## Manual verification

`pnpm tauri dev`, both views, both languages. Per the known trap, macOS System Events cannot type into
the WKWebView, so on-screen data comes from seeding `~/Library/Application Support/org.ponge.homework/homework.db`
directly with `sqlite3` before launch — a course row and a handful of homework rows covering: plain
text, bold/italic/code/strikethrough, a `https://` link, a `mailto:` link, an unsupported scheme link, a
heading-syntax line, empty text, and one `done: 1` row. Screenshot both views, both languages, then
`pkill -x homework` — leaving a window open is not acceptable.

What this cannot verify by hand: actually clicking a link and confirming the system browser opens
(scripted input cannot drive it, and doing it manually is Julien's to do if he wants to, not something
to claim as verified here).

## Review

Touches user-visible behaviour (the card, the checkbox, link opening) — three parallel review
subagents (architecture, quality-engineering, adversarial) against isolated rsync copies with
`node_modules` symlinked, running `./node_modules/.bin/vitest run --watch=false` rather than `pnpm test`.
Briefed to mutation-test one mutant at a time, restoring between each, and to report must-fix findings
only. Particular attention for the adversarial pass: the scheme allow-list (case, whitespace, a scheme
embedded after a control character), and that `node.properties.href` is genuinely never read anywhere.

## Definition of done

- `pnpm test` passes
- `cargo check` — not expected to need running; no Rust touched
- `pnpm tauri dev` started and both views, both languages, actually exercised with seeded data
- Three review subagents run, findings split into fixed and deliberately not fixed, reported in full
- Plain statement of what was not verified (the actual system-browser handoff)
