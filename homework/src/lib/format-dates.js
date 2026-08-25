// Turning a calendar date into words, with `Intl` and the active language.
//
// The split with `src/lib/dates.js` is deliberate and worth keeping: that module
// does arithmetic and knows nothing about language, this one does language and
// does no arithmetic. Nothing here shifts, compares or derives a date — it is
// handed the dates to render, already computed.
//
// Every `Date` comes from `toLocalDate`, never from `new Date("2026-08-24")`.
// The string form of that constructor is parsed as UTC midnight, which renders
// as the previous day in any negative-offset zone — the wrong-day bug the date
// helpers exist to prevent, arriving through the display layer instead. Because
// `toLocalDate` also validates, a malformed date throws here rather than putting
// "Invalid Date" in the top bar.
//
// The language is an argument rather than read from i18next, the same way
// `src/lib/grouping.js` takes its locale: it keeps these functions pure, and the
// caller already knows the active language.
//
// Formatters are cached per language. Building an `Intl.DateTimeFormat` is the
// expensive part, and the weekly view asks for seven day headings on every
// render.
import { toLocalDate } from "@/lib/dates.js";

function cachedFormatter(cache, language, options) {
  let formatter = cache.get(language);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(language, options);
    cache.set(language, formatter);
  }
  return formatter;
}

const fullDateFormatters = new Map();
const weekRangeFormatters = new Map();
const dayHeadingFormatters = new Map();

// The date the top bar shows in daily view: "Monday, August 24, 2026",
// "lundi 24 août 2026".
export function formatFullDate(date, language) {
  return cachedFormatter(fullDateFormatters, language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toLocalDate(date));
}

// The week the top bar shows in weekly view. `formatRange` collapses whatever
// the two ends share — the month and year inside one month, the year alone
// across a month boundary, nothing at all across a year — and it does it
// differently per language. Hand-assembling two formatted dates around a dash
// would get every one of those cases wrong in at least one language.
export function formatWeekRange(startDate, endDate, language) {
  return cachedFormatter(weekRangeFormatters, language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatRange(toLocalDate(startDate), toLocalDate(endDate));
}

// The heading on a weekly day block: "Monday, August 24", "lundi 24 août".
//
// The month is included on purpose. Asked for a weekday and a day alone, ICU
// falls back to a pattern that renders `en` as "24 Monday"; and a week that
// crosses a month would otherwise end with two blocks both reading "1" with
// nothing to tell them apart. The year is left out — the top bar carries it.
export function formatDayHeading(date, language) {
  return cachedFormatter(dayHeadingFormatters, language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(toLocalDate(date));
}
