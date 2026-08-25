import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CourseGroup } from "@/components/course-group";

const group = (course) => ({ course, homework: [{ id: 1, course_id: course.id }] });

describe("a course group", () => {
  it("shows the course name", () => {
    render(<CourseGroup group={group({ id: 1, name: "Maths", archived_at: null })} />);

    expect(screen.getByRole("heading", { name: "Maths" })).not.toBeNull();
  });

  // A homework entry on a course the user deleted keeps the real course name,
  // muted — which is why the course is archived rather than hard-deleted.
  it("mutes the heading of an archived course, and only that one", () => {
    const active = render(
      <CourseGroup group={group({ id: 1, name: "Maths", archived_at: null })} />,
    );
    const activeClasses = screen.getByRole("heading", { name: "Maths" }).className;
    active.unmount();

    render(
      <CourseGroup
        group={group({ id: 2, name: "Latin", archived_at: "2026-08-01T10:00:00Z" })}
      />,
    );

    const archivedClasses = screen.getByRole("heading", { name: "Latin" }).className;
    expect(archivedClasses).toContain("text-muted-foreground");
    expect(activeClasses).not.toContain("text-muted-foreground");
  });
});
