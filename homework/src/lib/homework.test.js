import { describe, it, expect } from "vitest";
import { validateHomeworkCourseId } from "@/lib/homework";

const COURSES = [
  { id: 1, name: "Maths", archived_at: null },
  { id: 12, name: "Zoologie", archived_at: null },
];

describe("validateHomeworkCourseId", () => {
  it("rejects a missing course", () => {
    expect(validateHomeworkCourseId(null, COURSES)).toBe("required");
    expect(validateHomeworkCourseId(undefined, COURSES)).toBe("required");
  });

  it("accepts a course id that is one of the options, including a multi-digit one", () => {
    expect(validateHomeworkCourseId(1, COURSES)).toBeNull();
    expect(validateHomeworkCourseId(12, COURSES)).toBeNull();
  });

  // A course picked in an open draft can be archived out from under it by a
  // concurrent action; once it drops out of the option list it must not save.
  it("rejects a course id that is no longer one of the options", () => {
    expect(validateHomeworkCourseId(99, COURSES)).toBe("required");
  });

  it("rejects everything when there are no options left", () => {
    expect(validateHomeworkCourseId(1, [])).toBe("required");
  });
});
