// One course heading with its homework underneath. The daily view and every day
// block of the weekly view use this same component, which is what makes the two
// views render identically — required by `specs/functional-specs.md`.
//
// The card itself, and the writes it makes (`setHomeworkDone`, `updateHomework`,
// `deleteHomework`), live here too: this is the one place both views' cards go
// through, the same way `CourseEditor` is the one place course writes go
// through.
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { updateHomework, deleteHomework, setHomeworkDone } from "@/db/homework";
import { isAllowedLinkScheme } from "@/lib/markdown-links";
import { isActiveCourse } from "@/lib/courses";
import { sortCourses } from "@/lib/grouping";
import { validateHomeworkCourseId } from "@/lib/homework";
import { fromLocalDate, toLocalDate } from "@/lib/dates";
import { formatFullDate } from "@/lib/format-dates";
import { intlFormatters, intlLabels } from "@/lib/calendar-intl";

// The inline subset plus bulleted and numbered lists, per
// `specs/functional-specs.md`. `del` is what `remark-gfm`'s strikethrough
// (`~~text~~`) maps to — strikethrough is GFM, not core CommonMark, which is
// why that plugin is needed at all. Lists (`ul`/`ol`/`li`) are core CommonMark,
// not a GFM extension, so no further plugin is needed for them.
//
// `unwrapDisallowed` is deliberate: a heading, blockquote, table or image is
// not given special rendering, but it is not dropped either — its own inline
// children stay, so `# Devoir` shows as `Devoir`. There is no bespoke fallback
// that reproduces the markup characters themselves; this is `react-markdown`'s
// own restriction, doing exactly what it does out of the box.
const ALLOWED_ELEMENTS = ["p", "strong", "em", "code", "del", "a", "ul", "ol", "li"];

// Reads `href` from the props react-markdown hands this component — already run
// through the library's own default URL transform — and never from
// `node.properties.href`, so that transform can never be bypassed. On top of it,
// the scheme is allow-listed: there is no content-security policy behind this
// ("csp" is deliberately null), so this check is the whole of the defence
// before a link ever reaches `@tauri-apps/plugin-opener`.
export function MarkdownLink({ href, children, onError }) {
  if (!isAllowedLinkScheme(href)) {
    return <>{children}</>;
  }

  const open = async (event) => {
    event.preventDefault();
    try {
      await openUrl(href);
    } catch (failure) {
      onError(failure, "link");
    }
  };

  return (
    <a href={href} onClick={open}>
      {children}
    </a>
  );
}

// The three editable fields, shared verbatim by the quick-add draft
// (`quick-add-homework.jsx`, `dueDateEditable={false}`) and the in-place edit
// state below (`dueDateEditable={true}`): the functional specs describe
// quick-add as inserting a card "already in its edit state", which is why this
// is one component rather than two similar forms drifting apart.
//
// Purely controlled and presentational: no `useAppData()`, no `src/db/` import.
// Escape anywhere in the form cancels, same as `Cancel` — this form is never
// inside a `Sheet`, so none of `course-editor.jsx`'s capture-phase workaround
// against the sheet's own Escape handling is needed here.
export function HomeworkEditForm({
  text,
  courseId,
  dueDate,
  dueDateEditable,
  courseOptions,
  error,
  onTextChange,
  onCourseChange,
  onDueDateChange,
  onSave,
  onCancel,
}) {
  const { t, i18n } = useTranslation();
  const [dueDateOpen, setDueDateOpen] = useState(false);

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      onCancel();
    }
  };

  return (
    // Fresh children each time this mounts — entering edit (in-place or
    // quick-add) — so the fade-in actually plays instead of only firing once.
    <div className="flex flex-1 flex-col gap-2 animate-in fade-in duration-150" onKeyDown={onKeyDown}>
      <Textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={t("homework.textPlaceholder")}
        aria-label={t("homework.textPlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* Radix `Select` values are strings; the id round-trips through
            `String()` / `Number()` at this boundary only, so the rest of the
            application keeps working with numeric course ids. */}
        <Select value={String(courseId)} onValueChange={(value) => onCourseChange(Number(value))}>
          <SelectTrigger aria-label={t("homework.course")} aria-invalid={error === "required"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courseOptions.map((course) => (
              <SelectItem
                key={course.id}
                value={String(course.id)}
                className={cn(!isActiveCourse(course) && "text-muted-foreground")}
              >
                {course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dueDateEditable ? (
          <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" aria-label={t("homework.dueDate")}>
                {formatFullDate(dueDate, i18n.language)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                // Monday, hard-coded, never derived from the locale — the same
                // rule `date-navigator.jsx` and `src/lib/dates.js` follow.
                weekStartsOn={1}
                formatters={intlFormatters(i18n.language)}
                labels={intlLabels(i18n.language, t)}
                selected={toLocalDate(dueDate)}
                defaultMonth={toLocalDate(dueDate)}
                onSelect={(picked) => {
                  // Same as `date-navigator.jsx`: `undefined` means the
                  // already-selected day was clicked again, a no-op here.
                  if (picked === undefined) {
                    setDueDateOpen(false);
                    return;
                  }
                  onDueDateChange(fromLocalDate(picked));
                  setDueDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm text-muted-foreground">
            {formatFullDate(dueDate, i18n.language)}
          </span>
        )}
      </div>
      {error === "required" ? (
        <p role="alert" className="text-sm text-destructive">
          {t("homework.courseRequired")}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("homework.cancel")}
        </Button>
        <Button size="sm" onClick={onSave}>
          {t("homework.save")}
        </Button>
      </div>
    </div>
  );
}

// The options an edit's course picker offers: active courses only, alphabetical.
// An archived course is never offered, including the entry's own if it has
// since been archived — reassigning always means picking a course that still
// exists. If the entry's current `courseId` is not among these options (its
// own course was already archived, or got archived while the draft stayed
// open), `validateHomeworkCourseId` catches it at `Save`, the same "required"
// error a never-chosen course shows.
function editCourseOptions(courses, locale) {
  return sortCourses(courses.filter(isActiveCourse), locale);
}

// Purely presentational in its view state; the writes and the reload they
// trigger live in `CourseGroup`, which is the one place both views' cards go
// through.
function HomeworkCard({ item, courses, locale, onToggle, onSave, onDelete, onError }) {
  const { t } = useTranslation();
  const done = item.done === 1;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  // Bumped by every `startEdit`/`cancelEdit`, so a `save()` in flight can tell
  // whether it is still the edit session the student is looking at. Without
  // this, Cancel during a slow write, followed by reopening edit and typing
  // something new, lets the first save's continuation resolve later and close
  // the *second*, unrelated draft out from under the student — discarding
  // whatever they had just typed with no explanation.
  const editSession = useRef(0);

  const courseOptions = useMemo(
    () => editCourseOptions(courses, locale),
    [courses, locale],
  );

  const startEdit = () => {
    editSession.current += 1;
    setDraft({ text: item.text, courseId: item.course_id, dueDate: item.due_date });
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    editSession.current += 1;
    setEditing(false);
    setDraft(null);
    setError(null);
  };

  const save = async () => {
    const problem = validateHomeworkCourseId(draft.courseId, courseOptions);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const session = editSession.current;
    // A failed write keeps the draft open rather than discarding what the
    // student typed — `onSave` reports the failure itself and answers whether
    // it landed.
    const saved = await onSave(item.id, draft);
    if (saved && editSession.current === session) {
      setEditing(false);
      setDraft(null);
      setError(null);
    }
  };

  const confirmDelete = async () => {
    setPendingDelete(false);
    await onDelete(item.id);
  };

  if (editing) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-3 shadow-xs">
        <HomeworkEditForm
          text={draft.text}
          courseId={draft.courseId}
          dueDate={draft.dueDate}
          dueDateEditable
          courseOptions={courseOptions}
          error={error}
          onTextChange={(text) => setDraft((current) => ({ ...current, text }))}
          onCourseChange={(courseId) => {
            setDraft((current) => ({ ...current, courseId }));
            setError(null);
          }}
          onDueDateChange={(dueDate) => setDraft((current) => ({ ...current, dueDate }))}
          onSave={save}
          onCancel={cancelEdit}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 rounded-2xl border bg-card p-3 shadow-xs">
      <Checkbox
        checked={done}
        aria-label={t("homework.toggleDone")}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      {item.text === "" ? (
        <div className="flex-1" />
      ) : (
        <div
          data-testid="homework-text"
          className={cn("flex-1 text-sm", done && "text-muted-foreground line-through")}
        >
          <ReactMarkdown
            allowedElements={ALLOWED_ELEMENTS}
            unwrapDisallowed
            remarkPlugins={[remarkGfm]}
            components={{
              a: (props) => <MarkdownLink {...props} onError={onError} />,
              // Tailwind's preflight resets `list-style` to `none` on every
              // `ul`/`ol`, so allowing the elements alone renders invisible
              // bullets/numbers — the markers have to be reinstated here.
              ul: (props) => <ul className="list-disc pl-5" {...props} />,
              ol: (props) => <ol className="list-decimal pl-5" {...props} />,
            }}
          >
            {item.text}
          </ReactMarkdown>
        </div>
      )}
      {/* Hover-revealed, deliberately: `specs/functional-specs.md` calls out
          keyboard and touch parity for these as out of scope. The checkbox
          above stays always visible, which is the one control this rule never
          applies to. */}
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" aria-label={t("homework.edit")} onClick={startEdit}>
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("homework.delete")}
          onClick={() => setPendingDelete(true)}
        >
          <Trash2Icon />
        </Button>
      </div>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("homework.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("homework.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("homework.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("homework.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CourseGroup({ group, onError = () => {} }) {
  const { i18n } = useTranslation();
  const { reload, courses, recordCourseUsed } = useAppData();
  const archived = group.course.archived_at !== null && group.course.archived_at !== undefined;

  const toggle = async (item, checked) => {
    try {
      await setHomeworkDone(item.id, checked);
      await reload();
    } catch (failure) {
      onError(failure, "save");
    }
  };

  // Returns whether the write landed, so `HomeworkCard` knows whether to leave
  // edit state — a failed save must not discard the student's draft.
  const saveEdit = async (id, draft) => {
    try {
      await updateHomework(id, { text: draft.text, dueDate: draft.dueDate, courseId: draft.courseId });
      recordCourseUsed(draft.courseId);
      await reload();
      return true;
    } catch (failure) {
      onError(failure, "save");
      return false;
    }
  };

  const remove = async (id) => {
    try {
      await deleteHomework(id);
      await reload();
    } catch (failure) {
      onError(failure, "save");
    }
  };

  return (
    <section
      className="flex flex-col gap-2 border-l-2 pl-3"
      // A left border in the course's own color, thin enough (2px) to stay
      // subtle regardless of how saturated the picked color is. Archived
      // fades only the border's own color via `color-mix`, the same
      // dimming an archived heading already gets — `opacity` on the whole
      // section would also fade the still-fully-visible cards underneath,
      // which is not how archiving works today (see the heading below).
      style={{
        borderColor: archived
          ? `color-mix(in oklch, ${group.course.color} 50%, transparent)`
          : group.course.color,
      }}
    >
      {/* An entry on a deleted course keeps displaying the real course name,
          muted. The course is archived, never hard-deleted, precisely so this
          name still exists. */}
      <h3 className={cn("text-sm font-medium", archived && "text-muted-foreground")}>
        {group.course.name}
      </h3>
      <ul className="flex flex-col gap-2">
        {group.homework.map((item) => (
          // `item.id` only changes for a genuinely new row (quick-add, or an
          // import that assigns fresh ids), so this only ever plays for a
          // card that is actually new — an existing card reusing its key
          // never remounts, so it never replays the animation on an ordinary
          // reload.
          <li key={item.id} data-testid="homework-item" className="animate-in fade-in duration-200">
            <HomeworkCard
              item={item}
              courses={courses}
              locale={i18n.language}
              onToggle={(checked) => toggle(item, checked)}
              onSave={saveEdit}
              onDelete={remove}
              onError={onError}
            />
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
