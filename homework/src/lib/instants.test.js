import { describe, it, expect } from "vitest";
import { nowInstant } from "@/lib/instants";

// 2026-08-21T09:14:03.500Z
const A_MOMENT = Date.UTC(2026, 7, 21, 9, 14, 3, 500);

describe("nowInstant", () => {
  it("formats an instant without milliseconds", () => {
    expect(nowInstant(() => A_MOMENT)).toBe("2026-08-21T09:14:03Z");
  });

  it("is UTC regardless of the local zone", () => {
    // The suite pins TZ=Europe/Paris, which is +02:00 in August. A local-time
    // formatting would read 11:14, not 09:14.
    expect(nowInstant(() => A_MOMENT)).toContain("T09:14:03Z");
  });

  it("sorts as a string in chronological order", () => {
    // `created_at` is compared as TEXT by SQLite, so the format has to sort.
    const earlier = nowInstant(() => A_MOMENT);
    const later = nowInstant(() => A_MOMENT + 1000);

    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it("avoids the mixed-format ordering trap that toISOString would create", () => {
    // Within one second, `.` (0x2E) sorts before `Z` (0x5A). So a row written
    // with the raw millisecond form sorts BEFORE a row written a moment earlier
    // in the plain form — entries would come back in the wrong order, forever,
    // because the rows are already on disk. This is why nothing calls
    // `toISOString()` directly.
    const earlierPlain = nowInstant(() => A_MOMENT - 500); // …:03Z
    const laterRaw = new Date(A_MOMENT).toISOString(); // …:03.500Z

    expect(laterRaw < earlierPlain).toBe(true);
    expect(nowInstant(() => A_MOMENT) >= earlierPlain).toBe(true);
  });

  it("reads the clock through the injected function", () => {
    const ticks = [A_MOMENT, A_MOMENT + 60_000];
    const clock = () => ticks.shift();

    expect(nowInstant(clock)).toBe("2026-08-21T09:14:03Z");
    expect(nowInstant(clock)).toBe("2026-08-21T09:15:03Z");
  });
});
