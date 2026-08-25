// Calendar dates: `YYYY-MM-DD`, no time and no time zone.
//
// The data model has two kinds of time and they are deliberately different types
// of value. A *calendar date* (`homework.due_date`) is what this module handles;
// an *instant* (`created_at`, `archived_at`) lives in `src/lib/instants.js` and
// is never shown as a due date.
//
// Two calendar dates compare correctly as plain strings — `"2026-08-24" <
// "2026-08-25"` — so there is no comparison helper here and none is needed.
//
// The week runs Monday to Sunday, seven days. Monday is hard-coded and is never
// derived from the locale or from `Intl`: the weekly view must not reshape itself
// when the user switches language.
//
// About `Date`, since the specs warn about it: the day shift below happens in
// **UTC**, where every day is exactly 86_400_000 ms long. The wrong-day bug is a
// property of *local* time — Europe/Paris has a 23-hour day in March and a
// 25-hour one in October, so adding a day's worth of milliseconds to local
// midnight lands on the wrong date twice a year. The local clock is read in
// exactly two places, `todayDate` and `toLocalDate`, and never for arithmetic.

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

// `Date.UTC(99, 0, 1)` is 1999, not year 99: the constructor remaps years 0 to
// 99 onto 1900. Our format accepts `0099-01-01` and an import can carry one, so
// the epoch is built with `setUTCFullYear`, which has no such remap.
function utcMillis(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

// `YYYY-MM-DD` is exactly ten characters (invariant 3 of the data model), so the
// representable range is year 1 to year 9999. Year 0 is excluded at the bottom
// end because `weekStart("0000-01-01")` would fall in year -1, which has no form
// here at all: the set of dates this module accepts is the set it can produce.
const MIN_MILLIS = utcMillis(1, 1, 1);
const MAX_MILLIS = utcMillis(9999, 12, 31);

// `null` rather than a throw: `isCalendarDate` needs the answer without one.
function parse(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const millis = utcMillis(year, month, day);
  // Out-of-range components roll over silently — `2026-02-30` becomes 2 March —
  // so the round trip is what rejects a date that looks well-formed but is not.
  const rolled = new Date(millis);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() + 1 !== month ||
    rolled.getUTCDate() !== day
  ) {
    return null;
  }
  if (millis < MIN_MILLIS || millis > MAX_MILLIS) {
    return null;
  }
  return { year, month, day, millis };
}

function requireCalendarDate(value) {
  const parsed = parse(value);
  if (parsed === null) {
    throw new Error(`invalid calendar date: ${JSON.stringify(value)}`);
  }
  return parsed;
}

// Throws rather than returning a string it would refuse as input: shifting off
// either end used to answer `"10000-01-01"` or `"0NaN-NaN-NaN"`, which look like
// dates, survive a `BETWEEN` query as an empty range, and say nothing about where
// they came from.
function format(millis) {
  if (!Number.isFinite(millis) || millis < MIN_MILLIS || millis > MAX_MILLIS) {
    throw new Error(`calendar date out of range: ${millis} ms from the epoch`);
  }
  const date = new Date(millis);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Monday is 1 and Sunday is 7, computed from the date itself.
function weekday(millis) {
  return ((new Date(millis).getUTCDay() + 6) % 7) + 1;
}

export function isCalendarDate(value) {
  return parse(value) !== null;
}

export function addDays(date, count) {
  const { millis } = requireCalendarDate(date);
  if (!Number.isInteger(count)) {
    throw new Error(`invalid day count: ${JSON.stringify(count)}`);
  }
  return format(millis + count * MS_PER_DAY);
}

export function nextDay(date) {
  return addDays(date, 1);
}

export function previousDay(date) {
  return addDays(date, -1);
}

// Exactly seven days, never "the same weekday next month".
export function nextWeek(date) {
  return addDays(date, 7);
}

export function previousWeek(date) {
  return addDays(date, -7);
}

// The Monday of the week containing `date`. A Sunday closes the week that began
// the Monday six days earlier — it is the seventh block, not the first day of
// the week ahead.
export function weekStart(date) {
  const { millis } = requireCalendarDate(date);
  return format(millis - (weekday(millis) - 1) * MS_PER_DAY);
}

// Seven calendar dates, Monday to Sunday. The weekly view renders one block per
// entry, including the days with no homework.
export function weekDays(date) {
  const start = requireCalendarDate(weekStart(date)).millis;
  const days = [];
  for (let offset = 0; offset < 7; offset += 1) {
    days.push(format(start + offset * MS_PER_DAY));
  }
  return days;
}

// The calendar date a `Date` falls on for the person looking at the screen —
// what a date picker hands back. Read with the local getters and never through
// `toISOString()`: at 00:30 in Europe/Paris the UTC round trip answers yesterday,
// which is the entire bug this module exists to prevent. This is the only way in
// from a `Date`, so no caller has to invent one.
export function fromLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`invalid date: ${JSON.stringify(date)}`);
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The local system date. `now` is injectable so tests do not depend on the clock.
export function todayDate(now = new Date()) {
  return fromLocalDate(now);
}

// A `Date` at LOCAL midnight, which is what `Intl` formatting needs. Never
// `new Date("2026-08-24")`: that is parsed as UTC midnight and renders as the
// previous day in any negative-offset zone. `setFullYear` for the same
// two-digit-year reason as `utcMillis`.
export function toLocalDate(date) {
  const { year, month, day } = requireCalendarDate(date);
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(0, 0, 0, 0);
  return local;
}
