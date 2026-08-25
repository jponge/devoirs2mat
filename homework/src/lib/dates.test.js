import { describe, it, expect, vi } from "vitest";
import {
  addDays,
  fromLocalDate,
  isCalendarDate,
  nextDay,
  nextWeek,
  previousDay,
  previousWeek,
  toLocalDate,
  todayDate,
  weekDays,
  weekStart,
} from "@/lib/dates";

// The suite pins TZ=Europe/Paris (see `vite.config.js`), deliberately not UTC:
// the wrong-day bugs these helpers exist to prevent only appear in an offset
// zone with daylight saving.

const REJECTED = [
  "2026-8-1",
  "2026-08-1",
  "26-08-01",
  "2026-13-01",
  "2026-00-10",
  "2026-08-32",
  "2026-02-30",
  "2027-02-29",
  // A century year is leap only when it divides by 400.
  "1900-02-29",
  "2100-02-29",
  // Year zero: its `weekStart` would land in year -1, which has no
  // `YYYY-MM-DD` form. The accepted set is exactly the representable set.
  "0000-01-01",
  "2026-08-24T00:00:00Z",
  "",
  "oops",
  null,
  undefined,
  new Date(2026, 7, 24),
];

describe("isCalendarDate", () => {
  it("accepts a real date in YYYY-MM-DD form", () => {
    expect(isCalendarDate("2026-08-24")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    // 2000 divides by 400, so it IS a leap year.
    expect(isCalendarDate("2000-02-29")).toBe(true);
    // The two ends of the representable range.
    expect(isCalendarDate("0001-01-01")).toBe(true);
    expect(isCalendarDate("9999-12-31")).toBe(true);
  });

  it("rejects anything else without throwing", () => {
    for (const value of REJECTED) {
      expect(isCalendarDate(value)).toBe(false);
    }
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-01", -1)).toBe("2026-01-31");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles 29 February in a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("skips 29 February in a common year", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("returns the same date for a zero shift", () => {
    expect(addDays("2026-08-24", 0)).toBe("2026-08-24");
  });

  it("survives a year below 100, which Date.UTC would remap onto 1900", () => {
    // `Date.UTC(99, 11, 31)` is 1999-12-31, so the constructor form answers
    // "2000-01-01" here. `setUTCFullYear` has no such remap.
    expect(addDays("0099-12-31", 1)).toBe("0100-01-01");
  });

  it("throws on a malformed date", () => {
    for (const value of REJECTED) {
      expect(() => addDays(value, 1)).toThrow(/invalid calendar date/);
    }
  });

  it("throws on a non-integer count", () => {
    expect(() => addDays("2026-08-24", 1.5)).toThrow(/invalid day count/);
    expect(() => addDays("2026-08-24", Number.NaN)).toThrow(/invalid day count/);
    expect(() => addDays("2026-08-24", "1")).toThrow(/invalid day count/);
  });

  it("names the offending value in the message", () => {
    // Naming it is the whole reason these throw instead of returning null: the
    // message has to say which value was wrong, at the call site that made it wrong.
    expect(() => addDays("2026-13-01", 1)).toThrow(/2026-13-01/);
    expect(() => addDays("2026-08-24", 1.5)).toThrow(/1\.5/);
  });

  it("throws rather than returning a date it would not accept back", () => {
    // `9999-12-31 + 1` has no ten-character form and a huge count overflows to
    // NaN. Both used to come back as strings — "10000-01-01", "0NaN-NaN-NaN" —
    // which invariant 3 of the data model forbids.
    expect(() => addDays("9999-12-31", 1)).toThrow(/out of range/);
    expect(() => addDays("0001-01-01", -1)).toThrow(/out of range/);
    expect(() => addDays("2026-08-24", 1e15)).toThrow(/out of range/);
  });

  it("always returns something it would accept back", () => {
    for (const date of ["2026-08-24", "2028-02-29", "0100-01-01", "2026-12-31"]) {
      for (const count of [-400, -7, -1, 0, 1, 7, 400]) {
        expect(isCalendarDate(addDays(date, count))).toBe(true);
      }
    }
  });
});

describe("the local clock never touches the arithmetic", () => {
  // This file pins Europe/Paris, a POSITIVE offset, where UTC midnight always
  // falls on the same local calendar day. That hides a whole class of mistake:
  // computing the day parts with `getDate()` instead of `getUTCDate()` passes
  // every other test here. A negative-offset zone is what makes it visible, and
  // a French app does run in one — Quebec, or a user who travels.
  it("gives the same answers in a negative-offset zone", () => {
    vi.stubEnv("TZ", "America/New_York");
    // The stub really bit: UTC midnight on the 25th is still the 24th locally.
    expect(new Date(Date.UTC(2026, 7, 25)).getDate()).toBe(24);

    expect(addDays("2026-08-24", 1)).toBe("2026-08-25");
    expect(nextDay("2026-08-24")).toBe("2026-08-25");
    expect(previousDay("2026-08-24")).toBe("2026-08-23");
    // An off-by-one weekday shifts the whole week, not just a day.
    expect(weekStart("2026-08-23")).toBe("2026-08-17");
    expect(weekDays("2026-08-19")[0]).toBe("2026-08-17");
    expect(weekDays("2026-08-19")[6]).toBe("2026-08-23");
  });
});

describe("malformed input", () => {
  it("is rejected by every helper that takes a calendar date", () => {
    // Decision 5 of the plan. Without this, `weekStart("oops")` could quietly
    // answer the week of 1970 and a plausible-looking wrong week would reach a view.
    for (const helper of [
      nextDay,
      previousDay,
      nextWeek,
      previousWeek,
      weekStart,
      weekDays,
      toLocalDate,
    ]) {
      for (const value of REJECTED) {
        expect(() => helper(value)).toThrow(/invalid calendar date/);
      }
    }
  });
});

describe("nextDay and previousDay", () => {
  it("moves by one day", () => {
    expect(nextDay("2026-08-24")).toBe("2026-08-25");
    expect(previousDay("2026-08-24")).toBe("2026-08-23");
  });

  it("never skips a weekend", () => {
    // Friday 2026-08-21 through Monday 2026-08-24, one day at a time.
    expect(nextDay("2026-08-21")).toBe("2026-08-22");
    expect(nextDay("2026-08-22")).toBe("2026-08-23");
    expect(nextDay("2026-08-23")).toBe("2026-08-24");
  });

  it("crosses the March daylight-saving transition", () => {
    // Europe/Paris springs forward on 2026-03-29: that local day is 23 hours long.
    expect(nextDay("2026-03-28")).toBe("2026-03-29");
    expect(nextDay("2026-03-29")).toBe("2026-03-30");
    expect(previousDay("2026-03-30")).toBe("2026-03-29");
  });

  it("crosses the October daylight-saving transition", () => {
    // Europe/Paris falls back on 2026-10-25: that local day is 25 hours long, so
    // adding 86_400_000 ms to local midnight lands at 23:00 on the SAME day.
    // This is the assertion that fails under local-time arithmetic.
    expect(nextDay("2026-10-25")).toBe("2026-10-26");
    expect(previousDay("2026-10-26")).toBe("2026-10-25");
    expect(nextDay("2026-10-24")).toBe("2026-10-25");
  });
});

describe("nextWeek and previousWeek", () => {
  it("moves by exactly seven days", () => {
    expect(nextWeek("2026-08-24")).toBe("2026-08-31");
    expect(previousWeek("2026-08-24")).toBe("2026-08-17");
  });

  it("is seven days and not the same weekday next month", () => {
    // A "+1 month" implementation would answer 2026-02-31 → 2026-03-03 here.
    expect(nextWeek("2026-01-31")).toBe("2026-02-07");
  });

  it("crosses a year boundary", () => {
    expect(nextWeek("2026-12-28")).toBe("2027-01-04");
    expect(previousWeek("2027-01-04")).toBe("2026-12-28");
  });

  it("crosses a daylight-saving transition", () => {
    expect(nextWeek("2026-10-19")).toBe("2026-10-26");
    expect(previousWeek("2026-10-26")).toBe("2026-10-19");
  });
});

describe("weekStart", () => {
  it("returns the Monday of the week containing the date", () => {
    // Monday 2026-08-17 through Saturday 2026-08-22.
    for (const date of [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]) {
      expect(weekStart(date)).toBe("2026-08-17");
    }
  });

  it("puts a Sunday at the END of the week that began the Monday before it", () => {
    // Sunday is the seventh block, not the first day of the week ahead.
    expect(weekStart("2026-08-23")).toBe("2026-08-17");
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-09-01")).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekDays", () => {
  it("returns seven consecutive days, Monday to Sunday", () => {
    expect(weekDays("2026-08-19")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });

  it("starts on a Monday and ends on a Sunday", () => {
    // Monday is hard-coded, never derived from `Intl` or the active language,
    // otherwise the weekly view would reshape itself on a language switch.
    const days = weekDays("2026-08-19");

    // Checked against `Date` directly rather than through `toLocalDate`, so a
    // mistake shared by both helpers cannot make them agree and pass.
    expect(new Date(`${days[0]}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${days[6]}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it("contains the date it was given, for every day of the week", () => {
    const week = weekDays("2026-08-17");

    for (const date of week) {
      expect(weekDays(date)).toEqual(week);
      expect(weekDays(date)).toContain(date);
    }
  });

  it("crosses a month boundary", () => {
    expect(weekDays("2026-09-02")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(weekDays("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
});

describe("todayDate", () => {
  it("reads the LOCAL date, not a UTC round trip", () => {
    // 00:30 local on 2026-08-24 in Europe/Paris is 2026-08-23T22:30Z, so an
    // implementation going through `toISOString()` answers yesterday.
    expect(todayDate(new Date(2026, 7, 24, 0, 30))).toBe("2026-08-24");
  });

  it("reads the local date in winter too", () => {
    // 00:30 local on 2026-01-15 is 2026-01-14T23:30Z.
    expect(todayDate(new Date(2026, 0, 15, 0, 30))).toBe("2026-01-15");
  });

  it("holds at the very end of a local day", () => {
    expect(todayDate(new Date(2026, 7, 24, 23, 59, 59))).toBe("2026-08-24");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayDate(new Date(2026, 2, 5, 12, 0))).toBe("2026-03-05");
  });

  it("defaults to the real clock", () => {
    // `isCalendarDate(todayDate())` alone would hold for any default at all,
    // including a frozen one.
    expect(todayDate()).toBe(fromLocalDate(new Date()));
  });
});

describe("toLocalDate", () => {
  it("builds local midnight, never UTC midnight", () => {
    // `new Date("2026-08-24")` is UTC midnight, which renders as the 23rd in any
    // negative-offset zone. This is what the views hand to `Intl`.
    const date = toLocalDate("2026-08-24");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(24);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  it("survives a year below 100", () => {
    expect(toLocalDate("0099-12-31").getFullYear()).toBe(99);
  });

  it("throws on a malformed date", () => {
    for (const value of REJECTED) {
      expect(() => toLocalDate(value)).toThrow(/invalid calendar date/);
    }
  });
});

describe("fromLocalDate", () => {
  it("reads the LOCAL day of a Date, never a UTC round trip", () => {
    // This is what a date picker hands back. `picked.toISOString().slice(0, 10)`
    // is the wrong-day bug: 00:30 local in Europe/Paris is yesterday in UTC.
    expect(fromLocalDate(new Date(2026, 7, 24, 0, 30))).toBe("2026-08-24");
    expect(fromLocalDate(new Date(2026, 7, 24, 23, 59, 59))).toBe("2026-08-24");
    expect(fromLocalDate(new Date(2026, 2, 5, 12, 0))).toBe("2026-03-05");
  });

  it("round-trips with toLocalDate", () => {
    for (const date of ["2026-08-24", "2026-03-29", "2026-10-25", "0099-12-31"]) {
      expect(fromLocalDate(toLocalDate(date))).toBe(date);
    }
  });

  it("throws on a Date that is not a date", () => {
    expect(() => fromLocalDate(new Date(Number.NaN))).toThrow(/invalid date/);
    expect(() => fromLocalDate(undefined)).toThrow(/invalid date/);
    expect(() => fromLocalDate("2026-08-24")).toThrow(/invalid date/);
  });
});
