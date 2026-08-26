import { describe, it, expect } from "vitest";
import {
  COURSE_COLORS,
  pickRandomCourseColor,
  normalizeCourseColor,
  validateCourseColor,
} from "@/lib/course-colors";

describe("COURSE_COLORS", () => {
  it("has exactly 20 entries", () => {
    expect(COURSE_COLORS).toHaveLength(20);
  });

  it("has a unique key per entry", () => {
    const keys = COURSE_COLORS.map((color) => color.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("holds only well-formed lowercase #rrggbb hex values", () => {
    for (const color of COURSE_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  // black is deliberately not literal #000000 — see the module comment: a
  // pure-black border would be close to invisible against the dark palette's
  // own near-black background.
  it("does not use literal black for the black swatch", () => {
    const black = COURSE_COLORS.find((color) => color.key === "black");
    expect(black.hex).not.toBe("#000000");
  });
});

describe("pickRandomCourseColor", () => {
  it("picks the first color when random() returns 0", () => {
    expect(pickRandomCourseColor(() => 0)).toBe(COURSE_COLORS[0].hex);
  });

  it("picks the last color when random() returns just under 1", () => {
    expect(pickRandomCourseColor(() => 0.999999)).toBe(
      COURSE_COLORS[COURSE_COLORS.length - 1].hex,
    );
  });

  it("picks the color at the index random() maps to", () => {
    // 5 / 20 = 0.25, safely inside the slice belonging to index 5 and not on
    // its boundary.
    expect(pickRandomCourseColor(() => 0.25)).toBe(COURSE_COLORS[5].hex);
  });

  it("defaults to Math.random and always returns a palette color", () => {
    const hex = pickRandomCourseColor();
    expect(COURSE_COLORS.map((color) => color.hex)).toContain(hex);
  });
});

describe("normalizeCourseColor", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeCourseColor("  #ef4444  ")).toBe("#ef4444");
  });

  it("lowercases hex digits", () => {
    expect(normalizeCourseColor("#EF4444")).toBe("#ef4444");
  });

  it("does not add a leading # when it is missing", () => {
    expect(normalizeCourseColor("ef4444")).toBe("ef4444");
  });

  it("leaves an already-clean color untouched", () => {
    expect(normalizeCourseColor("#ef4444")).toBe("#ef4444");
  });
});

describe("validateCourseColor", () => {
  it("accepts every curated palette color", () => {
    for (const color of COURSE_COLORS) {
      expect(validateCourseColor(color.hex)).toBeNull();
    }
  });

  it("accepts a well-formed hex color outside the curated palette", () => {
    expect(validateCourseColor("#123abc")).toBeNull();
  });

  it("is case-insensitive: uppercase hex digits are well-formed", () => {
    expect(validateCourseColor("#EF4444")).toBeNull();
    expect(validateCourseColor("#eF4444")).toBeNull();
  });

  it("trims before validating", () => {
    expect(validateCourseColor("  #ef4444  ")).toBeNull();
  });

  it("rejects the empty string as empty", () => {
    expect(validateCourseColor("")).toBe("empty");
  });

  it("rejects whitespace-only input as empty", () => {
    expect(validateCourseColor("   ")).toBe("empty");
  });

  it("rejects a color missing its leading #", () => {
    expect(validateCourseColor("ef4444")).toBe("invalid");
  });

  it("rejects the 3-digit hex shorthand", () => {
    expect(validateCourseColor("#fff")).toBe("invalid");
  });

  it("rejects a color with too few digits", () => {
    expect(validateCourseColor("#ef444")).toBe("invalid");
  });

  it("rejects a color with too many digits", () => {
    expect(validateCourseColor("#ef44444")).toBe("invalid");
  });

  it("rejects a color with a non-hex character", () => {
    expect(validateCourseColor("#ef444g")).toBe("invalid");
  });
});
