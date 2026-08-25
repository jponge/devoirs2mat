// One course heading with its homework underneath. The daily view and every day
// block of the weekly view use this same component, which is what makes the two
// views render identically — required by `specs/functional-specs.md`.
//
// Milestone 8 puts the actual cards inside. Until then the group renders its
// heading and nothing else, so the structure is real and only the card is
// missing.
import { cn } from "@/lib/utils";

export function CourseGroup({ group }) {
  const archived = group.course.archived_at !== null && group.course.archived_at !== undefined;

  return (
    <section className="flex flex-col gap-2">
      {/* An entry on a deleted course keeps displaying the real course name,
          muted. The course is archived, never hard-deleted, precisely so this
          name still exists. */}
      <h3 className={cn("text-sm font-medium", archived && "text-muted-foreground")}>
        {group.course.name}
      </h3>
      <ul className="flex flex-col gap-2">
        {group.homework.map((item) => (
          <li key={item.id} data-testid="homework-item">
            {/* Milestone 8: the card. */}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The short muted line an empty area shows rather than nothing at all, so that
// it reads as a deliberately empty day. Required by both the functional specs
// and the design guidelines.
export function EmptyLine({ children }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
