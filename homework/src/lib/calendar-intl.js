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
export function intlFormatters(language) {
  return {
    formatCaption: (date) =>
      new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }).format(date),
    formatWeekdayName: (date) =>
      new Intl.DateTimeFormat(language, { weekday: "short" }).format(date),
    formatMonthDropdown: (date) =>
      new Intl.DateTimeFormat(language, { month: "long" }).format(date),
  };
}

export function intlLabels(language, t) {
  return {
    labelGrid: (date) =>
      new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
      }).format(date),
    labelWeekday: (date) =>
      new Intl.DateTimeFormat(language, { weekday: "long" }).format(date),
    labelDayButton: (date) =>
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date),
    labelNav: () => t("topBar.calendarNav"),
    labelPrevious: () => t("topBar.previousMonth"),
    labelNext: () => t("topBar.nextMonth"),
  };
}
