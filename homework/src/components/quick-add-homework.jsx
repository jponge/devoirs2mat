// One hover-revealed component shared by the daily list and every weekly day
// block, per `specs/functional-specs.md`: "Both views use the same affordance
// and the same component." Reuses `HomeworkEditForm` from `course-group.jsx`
// with `dueDateEditable={false}` — quick-add inserts a card "already in its
// edit state", the same form the in-place edit uses, not a second one drifting
// apart from it.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeworkEditForm } from "@/components/course-group";
import { useAppData } from "@/components/app-data";
import { createHomework } from "@/db/homework";
import { isActiveCourse } from "@/lib/courses";
import { sortCourses } from "@/lib/grouping";
import { validateHomeworkCourseId } from "@/lib/homework";
import { nowInstant } from "@/lib/instants";

export function QuickAddHomework({ dueDate, onError = () => {} }) {
  const { t, i18n } = useTranslation();
  const { courses, reload, lastUsedCourseId, recordCourseUsed } = useAppData();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  // Active courses only, alphabetical — the draft's course pre-selects one of
  // these so `Save` works even if the student never touches the field, per
  // the decision recorded in this milestone's plan.
  const activeCourses = sortCourses(courses.filter(isActiveCourse), i18n.language);

  // Prefers the course a save (here or an in-place edit) last used this
  // session, so entering several entries for the same course in a row does
  // not require re-picking it each time. Falls back to the first active
  // course alphabetically when nothing has been used yet, or when the last
  // used one has since been archived.
  const defaultCourseId = () => {
    const usable =
      lastUsedCourseId !== null && activeCourses.some((course) => course.id === lastUsedCourseId);
    return usable ? lastUsedCourseId : activeCourses[0].id;
  };

  // Defensive: the whole main view is already gated on at least one course
  // existing (`App.jsx`'s first-run state), so this should never actually be
  // reached with none — but a button that could open a form with nothing to
  // pre-select would be worse than one that quietly renders nothing.
  if (activeCourses.length === 0) {
    return null;
  }

  const start = () => {
    setDraft({ text: "", courseId: defaultCourseId() });
    setError(null);
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
    setDraft(null);
    setError(null);
  };

  const save = async () => {
    const problem = validateHomeworkCourseId(draft.courseId, activeCourses);
    if (problem !== null) {
      setError(problem);
      return;
    }
    try {
      await createHomework({
        text: draft.text,
        dueDate,
        courseId: draft.courseId,
        createdAt: nowInstant(),
      });
      recordCourseUsed(draft.courseId);
      await reload();
      setOpen(false);
      setDraft(null);
      setError(null);
    } catch (failure) {
      // Left open on failure, the same way a failed edit keeps its draft: the
      // typed text should not vanish along with the toast reporting it.
      onError(failure, "save");
    }
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("homework.add")}
        className="w-fit gap-1 self-start opacity-0 transition-opacity group-hover:opacity-100"
        onClick={start}
      >
        <PlusIcon />
        {t("homework.add")}
      </Button>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed p-3">
      <HomeworkEditForm
        text={draft.text}
        courseId={draft.courseId}
        dueDate={dueDate}
        dueDateEditable={false}
        courseOptions={activeCourses}
        error={error}
        onTextChange={(text) => setDraft((current) => ({ ...current, text }))}
        onCourseChange={(courseId) => {
          setDraft((current) => ({ ...current, courseId }));
          setError(null);
        }}
        onDueDateChange={() => {}}
        onSave={save}
        onCancel={cancel}
      />
    </div>
  );
}
