// The curated course-color palette, plus normalization and validation for the
// hex value a course stores. Pure: no React, no i18next, no `src/db/`.
//
// 20 entries: bold, classic crayon-box hues a 6-18 year old already has names
// for, deliberately not a design-system scale — this palette does not track
// Tailwind (or any other CSS theme) and its values were chosen independently.
// 17 hues around the color wheel plus black, gray and brown: a student may
// reasonably want a course to read as "no particular color" (the two
// neutrals), and brown rounds the palette to 20 rather than sitting as a
// third neutral entry. `black` is `#404040`, not literal `#000000`: a
// pure-black left border is close to invisible against the dark system
// palette's own near-black background, and `#404040` stays dark enough to
// read as "black" while staying visible there — this is the one entry not
// picked purely for hue.
//
// `key` is what the accessible name and the i18n catalog hang off — a
// swatch's `aria-label` says "Red" / "Rouge", never a hex code.
export const COURSE_COLORS = [
  { key: "red", hex: "#e63946" },
  { key: "orange", hex: "#f4772e" },
  { key: "amber", hex: "#f4a300" },
  { key: "yellow", hex: "#ffd60a" },
  { key: "lime", hex: "#a4d65e" },
  { key: "green", hex: "#2ecc71" },
  { key: "emerald", hex: "#16a085" },
  { key: "teal", hex: "#159895" },
  { key: "cyan", hex: "#22b8cf" },
  { key: "sky", hex: "#339af0" },
  { key: "blue", hex: "#3457d5" },
  { key: "indigo", hex: "#4c4ddc" },
  { key: "violet", hex: "#7048e8" },
  { key: "purple", hex: "#9c36b5" },
  { key: "fuchsia", hex: "#d6249f" },
  { key: "pink", hex: "#f7568c" },
  { key: "rose", hex: "#ff6b81" },
  { key: "black", hex: "#404040" },
  { key: "gray", hex: "#6c757d" },
  { key: "brown", hex: "#8b5a2b" },
];

// The database's own backstop (`src-tauri/src/migrations.rs`) requires
// exactly this shape: `#`, six lowercase hex digits, nothing else. Matched
// here against an already-normalized (trimmed, lowercased) value, which is
// what makes validation case-insensitive from the caller's point of view.
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

// `random` is injectable, the same dependency-injection pattern `nowInstant`
// uses for the clock, so a test can pin which color comes out.
export function pickRandomCourseColor(random = Math.random) {
  const index = Math.floor(random() * COURSE_COLORS.length);
  return COURSE_COLORS[index].hex;
}

// Trims; lowercases; never adds a leading '#' if one is missing — a color
// typed without it stays invalid rather than being silently repaired.
export function normalizeCourseColor(color) {
  return color.trim().toLowerCase();
}

// `null` when `color` is fine to save, otherwise `"empty"` or `"invalid"` —
// mirrors `validateCourseName`'s shape. Accepts any well-formed `#rrggbb`,
// not just the 20 curated colors: the palette constrains the swatch grid's
// own buttons, not what counts as a valid color to store.
export function validateCourseColor(color) {
  const normalized = normalizeCourseColor(color);
  if (normalized === "") {
    return "empty";
  }
  return HEX_COLOR_RE.test(normalized) ? null : "invalid";
}
