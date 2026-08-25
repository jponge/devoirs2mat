import { describe, it, expect } from "vitest";
import { normalizeCourseName, validateCourseName } from "@/lib/courses";

describe("normalizeCourseName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeCourseName("  Maths  ")).toBe("Maths");
  });

  it("trims tabs and newlines too", () => {
    expect(normalizeCourseName("\t\nMaths\n\t")).toBe("Maths");
  });

  it("collapses nothing else: internal spacing survives", () => {
    expect(normalizeCourseName("  Éducation   physique  ")).toBe("Éducation   physique");
  });

  it("reduces whitespace-only input to the empty string", () => {
    expect(normalizeCourseName("   ")).toBe("");
    expect(normalizeCourseName("\t\n")).toBe("");
  });

  it("leaves an already-clean name untouched", () => {
    expect(normalizeCourseName("Maths")).toBe("Maths");
  });
});

describe("validateCourseName", () => {
  it("accepts a name with no other courses at all", () => {
    expect(validateCourseName("Maths", [])).toBeNull();
  });

  it("rejects the empty string as empty", () => {
    expect(validateCourseName("", [])).toBe("empty");
  });

  it("rejects whitespace-only input as empty", () => {
    expect(validateCourseName("   ", [])).toBe("empty");
    expect(validateCourseName("\t\n", [])).toBe("empty");
  });

  it("trims before comparing against an existing course", () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("  Maths  ", courses)).toBe("duplicate");
  });

  it("rejects a name already used by an active course", () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("Maths", courses)).toBe("duplicate");
  });

  it("treats case-differing names as duplicates", () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("maths", courses)).toBe("duplicate");
    expect(validateCourseName("MATHS", courses)).toBe("duplicate");
  });

  it("treats an accented name differing only in case as a duplicate", () => {
    // The Éducation physique / Zoologie rule: compared in JavaScript with
    // localeCompare, never in SQL.
    const courses = [
      { id: 1, name: "Éducation physique", archived_at: null, created_at: "2026-08-21T09:14:03Z" },
    ];

    expect(validateCourseName("éducation PHYSIQUE", courses)).toBe("duplicate");
  });

  it("does not treat differing accents as the same name", () => {
    const courses = [{ id: 1, name: "École", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("Ecole", courses)).toBeNull();
  });

  it("allows a name already used by an ARCHIVED course", () => {
    // specs/data-model.md line 50: an archived course may share its name with
    // a new active one — that is what lets a student re-create a course they
    // deleted by mistake.
    const courses = [
      { id: 1, name: "Maths", archived_at: "2026-08-20T09:14:03Z", created_at: "2026-08-01T09:14:03Z" },
    ];

    expect(validateCourseName("Maths", courses)).toBeNull();
  });

  it("does not let a name collide with the course's own current name when renaming", () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("Maths", courses, 1)).toBeNull();
    expect(validateCourseName("  Maths  ", courses, 1)).toBeNull();
  });

  it("still rejects a rename that collides with a DIFFERENT active course", () => {
    const courses = [
      { id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" },
      { id: 2, name: "Zoologie", archived_at: null, created_at: "2026-08-22T09:14:03Z" },
    ];

    expect(validateCourseName("Zoologie", courses, 1)).toBe("duplicate");
  });

  it("still rejects an empty rename even with excludeId set", () => {
    const courses = [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-21T09:14:03Z" }];

    expect(validateCourseName("   ", courses, 1)).toBe("empty");
  });
});
