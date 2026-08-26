import { describe, it, expect, vi } from "vitest";
import {
  formatFullDate,
  formatWeekRange,
  formatDayHeading,
} from "@/lib/format-dates.js";

// These assertions pin the LITERAL strings `Intl` produces, not a regex that
// would pass on almost anything. That makes them sensitive to the ICU data in
// the Node build — which is the point: a change in how a date reads to the
// student should fail here rather than be discovered on screen.
//
// Pinned against node 26.7.0 with full ICU on 2026-08-25.

describe("formatFullDate", () => {
  it("reads as a long date in each language", () => {
    expect(formatFullDate("2026-08-24", "en")).toBe("Monday, August 24, 2026");
    expect(formatFullDate("2026-08-24", "fr")).toBe("Lundi 24 août 2026");
  });

  it("handles 29 February in a leap year", () => {
    expect(formatFullDate("2028-02-29", "en")).toBe("Tuesday, February 29, 2028");
    expect(formatFullDate("2028-02-29", "fr")).toBe("Mardi 29 février 2028");
  });

  // A malformed date must fail where the mistake was made rather than put
  // "Invalid Date" in the top bar.
  it("rejects anything that is not a calendar date", () => {
    expect(() => formatFullDate("nope", "en")).toThrow();
    expect(() => formatFullDate("2026-02-30", "en")).toThrow();
  });
});

describe("formatWeekRange", () => {
  // `formatRange` separates the two ends with an en dash padded by THIN SPACES
  // (U+2009), not with the spaces and hyphen anyone would type. Written as
  // escapes rather than pasted, because pasted they are invisible in the source
  // and an editor that "tidies" whitespace would silently rewrite them.
  const DASH = "\u2009\u2013\u2009";

  it("uses a thin-space-padded en dash, not a hyphen", () => {
    expect(formatWeekRange("2026-08-31", "2026-09-06", "en")).toContain(DASH);
    expect(formatWeekRange("2026-08-31", "2026-09-06", "en")).not.toContain(" - ");
  });

  it("collapses the parts the two ends share", () => {
    // `Intl` does the collapsing itself, differently per language, which is the
    // whole reason `formatRange` is used rather than two formats and a dash.
    // French keeps no space at all around the dash here; English keeps two.
    expect(formatWeekRange("2026-08-24", "2026-08-30", "en")).toBe(
      `August 24${DASH}30, 2026`,
    );
    expect(formatWeekRange("2026-08-24", "2026-08-30", "fr")).toBe(
      "24\u201330 ao\u00fbt 2026",
    );
  });

  it("spells out both months when the week crosses one", () => {
    expect(formatWeekRange("2026-08-31", "2026-09-06", "en")).toBe(
      `August 31${DASH}September 6, 2026`,
    );
    expect(formatWeekRange("2026-08-31", "2026-09-06", "fr")).toBe(
      `31 ao\u00fbt${DASH}6 septembre 2026`,
    );
  });

  it("spells out both years when the week crosses one", () => {
    expect(formatWeekRange("2025-12-29", "2026-01-04", "en")).toBe(
      `December 29, 2025${DASH}January 4, 2026`,
    );
    expect(formatWeekRange("2025-12-29", "2026-01-04", "fr")).toBe(
      `29 d\u00e9cembre 2025${DASH}4 janvier 2026`,
    );
  });

  it("rejects a malformed end of the range", () => {
    expect(() => formatWeekRange("2026-08-24", "oops", "en")).toThrow();
  });
});

describe("formatDayHeading", () => {
  it("names the weekday and the day", () => {
    expect(formatDayHeading("2026-08-24", "en")).toBe("Monday, August 24");
    expect(formatDayHeading("2026-08-24", "fr")).toBe("Lundi 24 août");
  });

  // The month is deliberately part of the heading. Without it `en` renders
  // "24 Monday" — ICU falls back to a pattern with the parts in that order when
  // no month is asked for — and a week crossing a month would show two blocks
  // both reading "1" with nothing to tell them apart.
  it("keeps the month, so a week crossing one stays readable", () => {
    expect(formatDayHeading("2026-09-06", "en")).toBe("Sunday, September 6");
    expect(formatDayHeading("2026-09-06", "fr")).toBe("Dimanche 6 septembre");
  });
});

describe("in a negative-offset zone", () => {
  // The guard the testing section of the technical stack requires. Every string
  // above is produced under Europe/Paris, a POSITIVE offset, where UTC midnight
  // always falls on the same local calendar day — so a helper that built its
  // `Date` with `new Date("2026-08-24")` (parsed as UTC midnight) would pass all
  // of them and render the previous day in Montréal or New York.
  it("names the same days", async () => {
    vi.stubEnv("TZ", "America/New_York");
    // The stub really bit: UTC midnight on the 25th is still the 24th here.
    expect(new Date(Date.UTC(2026, 7, 25)).getDate()).toBe(24);

    // The `Intl.DateTimeFormat` instances are cached at module scope and the
    // tests above already built them under Europe/Paris, where the stub cannot
    // reach them. Re-importing rebuilds the cache in the stubbed zone — without
    // this the whole block still runs in Paris and guards nothing.
    vi.resetModules();
    const { formatFullDate, formatDayHeading, formatWeekRange } = await import(
      "@/lib/format-dates.js"
    );

    expect(formatFullDate("2026-08-24", "en")).toBe("Monday, August 24, 2026");
    expect(formatFullDate("2026-08-24", "fr")).toBe("Lundi 24 août 2026");
    expect(formatDayHeading("2026-08-24", "fr")).toBe("Lundi 24 août");
    expect(formatWeekRange("2026-08-24", "2026-08-30", "fr")).toBe(
      "24\u201330 ao\u00fbt 2026",
    );
  });
});
