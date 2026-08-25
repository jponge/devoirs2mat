// The course editor, in the side panel: the list of courses, an inline field to
// add one, inline renaming in the row itself, and a confirmation before a course
// is archived.
//
// Only active courses are listed. An archived course keeps existing — a homework
// entry goes on displaying its real name, muted — but there is no un-archive
// action anywhere in the application, so listing them here would be a list of
// things the student cannot act on.
//
// Nothing here issues `DELETE FROM courses`. Deleting always means setting
// `archived_at`, including for a course no homework has ever used:
// `specs/functional-specs.md` is explicit that there is deliberately no second
// code path.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PencilIcon, Trash2Icon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppData } from "@/components/app-data";
import { archiveCourse, createCourse, renameCourse } from "@/db/courses";
import { isActiveCourse, normalizeCourseName, validateCourseName } from "@/lib/courses";
import { sortCourses } from "@/lib/grouping";
import { nowInstant } from "@/lib/instants";

// `validateCourseName` answers a reason, not a sentence: it is a pure module and
// knows nothing about i18next. The mapping is explicit rather than built from
// the reason, so a catalogue key can never be assembled at runtime out of a
// value that turns out not to have one.
const PROBLEM_KEYS = {
  empty: "courses.nameEmpty",
  duplicate: "courses.nameDuplicate",
};

// `onError` rather than a toast raised here, exactly like the language switch:
// a write that failed is a failure the student cannot act on, and whoever owns
// the toaster reports it. A *name* that was refused is the opposite — the
// student can fix it where they are — so that one is shown inline on the field.
export function CourseEditor({ onError = () => {} }) {
  const { t, i18n } = useTranslation();
  const { courses, reload } = useAppData();

  const [draft, setDraft] = useState("");
  const [draftProblem, setDraftProblem] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editProblem, setEditProblem] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const active = sortCourses(
    courses.filter(isActiveCourse),
    i18n.language,
  );

  const add = async (event) => {
    event.preventDefault();
    const problem = validateCourseName(draft, courses);
    if (problem !== null) {
      setDraftProblem(problem);
      return;
    }
    try {
      await createCourse(normalizeCourseName(draft), nowInstant());
      setDraft("");
      setDraftProblem(null);
      await reload();
    } catch (failure) {
      onError(failure);
    }
  };

  const startRename = (course) => {
    setEditingId(course.id);
    setEditDraft(course.name);
    setEditProblem(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditProblem(null);
  };

  const commitRename = async () => {
    // The course keeps its own name out of the duplicate check: renaming
    // `Maths` to `Maths` is a no-op, not a collision.
    const problem = validateCourseName(editDraft, courses, editingId);
    if (problem !== null) {
      setEditProblem(problem);
      return;
    }
    try {
      await renameCourse(editingId, normalizeCourseName(editDraft));
      setEditingId(null);
      setEditProblem(null);
      await reload();
    } catch (failure) {
      onError(failure);
    }
  };

  const confirmDelete = async () => {
    const course = pendingDelete;
    setPendingDelete(null);
    try {
      await archiveCourse(course.id, nowInstant());
      await reload();
    } catch (failure) {
      onError(failure);
    }
  };

  // Escape cancels what is being typed. Keeping the panel open while it does is
  // the sheet's side of the bargain — see `onEscapeKeyDown` in `side-panel.jsx`.
  const onRenameKeyDown = (event) => {
    if (event.key === "Escape") {
      cancelRename();
    }
  };

  const onDraftKeyDown = (event) => {
    if (event.key === "Escape") {
      setDraft("");
      setDraftProblem(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4">
      <h3 className="text-sm font-medium">{t("courses.title")}</h3>

      <form className="flex gap-2" onSubmit={add}>
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDraftProblem(null);
          }}
          onKeyDown={onDraftKeyDown}
          data-cancels-escape={draft === "" ? undefined : "true"}
          placeholder={t("courses.namePlaceholder")}
          aria-label={t("courses.namePlaceholder")}
          aria-invalid={draftProblem !== null}
          aria-describedby={draftProblem === null ? undefined : "course-add-problem"}
        />
        <Button type="submit" size="sm">
          {t("courses.add")}
        </Button>
      </form>
      {draftProblem !== null ? (
        <p id="course-add-problem" role="alert" className="text-sm text-destructive">
          {t(PROBLEM_KEYS[draftProblem])}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {active.map((course) =>
          course.id === editingId ? (
            <li key={course.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={editDraft}
                  onChange={(event) => {
                    setEditDraft(event.target.value);
                    setEditProblem(null);
                  }}
                  onKeyDown={onRenameKeyDown}
                  data-cancels-escape="true"
                  aria-label={t("courses.rename", { name: course.name })}
                  aria-invalid={editProblem !== null}
                  aria-describedby={editProblem === null ? undefined : "course-rename-problem"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("courses.saveRename")}
                  onClick={commitRename}
                >
                  <CheckIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("courses.cancelRename")}
                  onClick={cancelRename}
                >
                  <XIcon />
                </Button>
              </div>
              {editProblem !== null ? (
                <p id="course-rename-problem" role="alert" className="text-sm text-destructive">
                  {t(PROBLEM_KEYS[editProblem])}
                </p>
              ) : null}
            </li>
          ) : (
            <li key={course.id} className="flex items-center justify-between gap-1">
              <span className="truncate text-sm">{course.name}</span>
              <span className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("courses.rename", { name: course.name })}
                  onClick={() => startRename(course)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("courses.delete", { name: course.name })}
                  onClick={() => setPendingDelete(course)}
                >
                  <Trash2Icon />
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("courses.deleteTitle", { name: pendingDelete === null ? "" : pendingDelete.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("courses.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("courses.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("courses.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
