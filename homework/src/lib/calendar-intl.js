// Localising react-day-picker through `Intl` rather than through a date-fns
// `locale` object, which is how the library expects it. We deliberately have
// none — `date-fns` arrives only as react-day-picker's own transitive
// dependency and is not even resolvable from our code — so the strings it
// would provide come from `Intl` instead, per `specs/technical-stack.md`.
//
// `formatters` covers what is drawn; `labels` covers what is announced.
// Without the second half the picker would show one language on screen while
// reading its month and its days in another to a screen reader. Both are
// required wherever a `Calendar` appears.
//
// Shared by `date-navigator.jsx` and the due-date field in
// `course-group.jsx`'s edit-in-place form: this used to be a pair of
// functions local to `date-navigator.jsx` before the edit-in-place picker
// needed the exact same localisation.
import { capitalizeFirst } from "@/lib/format-dates.js";

export function intlFormatters(language) {
  return {
    // The visible month/year heading above the grid, e.g. "Août 2026" —
    // capitalized like the weekday row right below it, so the two don't clash
    // on the same popover.
    formatCaption: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, {
          month: "long",
          year: "numeric",
        }).format(date),
        language,
      ),
    // Column headers, e.g. "lun." — capitalized to match the day headings and
    // date displays elsewhere, which read "Lundi 24 août" rather than French's
    // default lowercase weekday names.
    formatWeekdayName: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, { weekday: "short" }).format(date),
        language,
      ),
    formatMonthDropdown: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, { month: "long" }).format(date),
        language,
      ),
  };
}

export function intlLabels(language, t) {
  return {
    labelGrid: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, {
          month: "long",
          year: "numeric",
        }).format(date),
        language,
      ),
    labelWeekday: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, { weekday: "long" }).format(date),
        language,
      ),
    labelDayButton: (date) =>
      capitalizeFirst(
        new Intl.DateTimeFormat(language, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(date),
        language,
      ),
    labelNav: () => t("topBar.calendarNav"),
    labelPrevious: () => t("topBar.previousMonth"),
    labelNext: () => t("topBar.nextMonth"),
  };
}
