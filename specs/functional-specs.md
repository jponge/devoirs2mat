# Functional specifications

## Application user

The application user is a student (typically aged 6-18) who needs to manage homework at home and in the classroom.

It is localized in English and French. On startup the language is the one the user last chose; if there is none yet it
is detected from the system locale (prefix match on the webview locale), falling back to English for anything that is
neither English nor French. Changing the language in the side panel persists the choice, takes effect immediately
without a restart, and always wins over detection afterwards.

## Dates

- A due date is a calendar date, with no time and no time zone. It is stored as `TEXT` in `YYYY-MM-DD` form. Never do
  the arithmetic in local time and never store a due date as epoch milliseconds: a local day is not always
  86 400 000 ms long once a daylight-saving transition falls inside it, and that is how a homework item due on Monday
  ends up displayed on Sunday. `src/lib/dates.js` shifts days in UTC, where a day always is, and reads the local clock
  in exactly two places — answering what today is, and building the `Date` handed to `Intl` for display
- The week runs from Monday to Sunday, in both languages. The week start is always Monday and is never derived from
  the locale, otherwise the weekly view would reshape itself when the user switches language
- The weekly view shows seven day blocks, Monday to Sunday. Sunday closes the week that began on the Monday before it,
  so every date belongs to exactly one week. Previous / next week shifts by exactly seven days, previous / next day
  shifts by one day and never skips weekends
- The current day is the local system date. It does not need to refresh by itself at midnight

## First run

The database starts empty: no courses, no homework, nothing seeded. The student never has to prune a list of subjects
they do not take, and no course name is frozen in whichever language happened to be detected at install time.

Because a course is mandatory, adding homework is disabled until at least one course exists. The main view then shows
an empty state explaining that a course is needed first, with a button that opens the side panel on the course editor.

## What the application does in the main view

- The focus is on homework entries
- The application offers daily and weekly views. A segmented Daily / Weekly control sits next to the date selection
  component, and switching views keeps the currently selected date
- A homework entry has some text, a due date, a course, and a completion mark. The completion mark is a single
  boolean. The text may be empty: an entry can deliberately be saved with no text yet and filled in later, so nothing
  ever refuses to save on empty text. The course is mandatory
- A homework entry is displayed as a card, so an entry with empty text is still visible and clickable and can be
  edited afterwards. The due date and the course are never optional: only the text can be empty
- The homework text is written and stored as Markdown, restricted to inline formatting: bold, italic, inline code,
  strikethrough and links. Headings, lists, tables, images and raw HTML are deliberately not supported, and anything
  outside the supported subset is displayed as the literal characters the student typed. This keeps a card to a
  single, predictable paragraph
- Markdown is rendered the same way in the daily and the weekly views
- A link inside a homework text opens in the system browser, and never navigates the application window
- Every card carries a checkbox, always visible and never hidden behind hover: completing homework is the most
  frequent action in the application, and it must also be scannable at a glance. Clicking it toggles completion and
  writes immediately, with no confirmation
- When a homework entry is completed, it still shows in the current day or weekly view. It stays exactly where it is —
  completion never removes it and never reorders it — and it is displayed checked, with muted and struck-through text
- In a weekly view, we have blocks per-day, and homework entries are grouped under matching courses. The day blocks
  are laid out on **two columns**: Monday and Tuesday, then Wednesday and Thursday, then Friday on its own, then
  Saturday and Sunday. Friday sits in the left column with the right-hand cell left empty, so that the weekend stays
  paired. A block grows with its content and
  the page scrolls — a day block never scrolls on its own
- The daily view groups entries by course in the same way and with the same component: a course heading, its cards
  underneath, courses in alphabetical order
- An area with no homework — an empty day block, or an empty daily view — shows a short muted line rather than nothing
  at all, so that it reads as a deliberately empty day and the place to hover to add something stays obvious
- In the top we will have a component to select the current day:
    - in the daily view this selects the current day
    - in the weekly view this puts us in the week of the current day
    - the date selection component will be surrounded by:
        - previous / next day buttons in daily view
        - previous / next week in weekly view
- The workflows and user interface are clean and progressive:
    - when the mouse goes over a homework item, a button to edit it and a button to delete it appear
    - when the mouse goes over a day block in the weekly view, or over the day's list in the daily view, a button to
      quickly add a new entry appears. Both views use the same affordance and the same component
    - hover-revealed controls are a deliberate design decision, made with the target audience in mind. Keyboard and
      touch parity for them is out of scope for now: do not re-open this, and do not "fix" it as an accessibility bug
- Adding a homework entry:
    - the quick-add button inserts a new card into that day, already in its edit state. Nothing is written to the
      database until `Save`, and `Cancel` simply discards the card
    - the due date is the day the entry is being added to, and it is not editable while creating. Moving an entry to
      another day happens afterwards, through the edit state
    - the course must be chosen before `Save`: it is the only required field. The text may be left empty
- Editing a homework entry:
    - the edit button turns the card itself into an edit state, in place. It is not a modal dialog and the card does
      not move
    - the edit state exposes three editable fields: the text, the course, and the due date
    - the text is edited as raw Markdown in a text area. The rendered version comes back once editing ends
    - `Save` commits the change, `Cancel` restores the values the entry had before editing, and `Escape` is equivalent
      to `Cancel`. Nothing is written to the database until `Save`
- Deleting a homework entry:
    - the delete button opens a confirmation dialog, and the entry is removed only once the deletion is confirmed
    - deletion is final: there is no undo and no trash. This is why it is confirmed and editing is not

## What the application offers in a side panel

The side panel is a drawer: hidden by default, opened from a button in the top bar, and dismissed with `Escape` or a
click outside. The main view therefore always keeps the full window width.

It exposes further operations:

- changing the current language
- editing courses, but deleting a course does not delete the existing homework items no matter if they have been
  completed or not. Concretely, courses are soft-deleted (`courses.archived_at`): a homework entry keeps its
  `course_id` and keeps displaying its real course name, muted and sorted after the active courses, while the course
  disappears from the pickers used to create or edit entries. Re-creating a course with the same name does not
  re-attach the old entries. Never hard-delete a course row: that would leave the SQL export referring to a course
  that no longer exists
    - courses are created and renamed from that same list in the drawer. Renaming a course updates every entry at
      once, because an entry references the course and not its name
    - deleting a course always archives it, including a course no homework has ever used. There is deliberately no
      second code path that really removes a row
- exporting and importing data: we want to ensure backups and restores are possible, and to do that we want to export
  the database schema and content as SQL scripts for maximum portability
    - the export starts with a `-- devoirs2mat schema-version: N` header line
    - importing is a **full restore, never a merge**: it replaces the entire database content, after an explicit
      confirmation that names what is about to be lost, and the whole script runs inside a single transaction so that
      any failure rolls everything back
    - an import whose schema version does not match the one this build of the application produces is refused
      outright rather than partially applied
    - do not split the script by hand on `;` — homework text may legitimately contain one

## Errors and feedback

- A failure the student cannot act on where they are — a write that failed, an import that was refused, a migration
  error at startup — is reported with a toast
- A problem the student can fix in place — no course chosen on a new entry — is reported inline, on the field itself
- A failure is never silent: an action that did not work must say so

## What the application doesn't do in any view

- It doesn't track results / exams
- It has no remote cloud synchronization
- We do not need to re-order courses, when they need to be sorted, we assume alphabetical order. Sort them in
  JavaScript with `localeCompare` and not with SQL `ORDER BY`, which compares bytes and would place `Éducation
  physique` after `Zoologie`
