// The daily view: the selected day's homework, grouped by course, courses in
// alphabetical order.
import { useTranslation } from "react-i18next";
import { useAppData } from "@/components/app-data";
import { CourseGroup, EmptyLine } from "@/components/course-group";
import { QuickAddHomework } from "@/components/quick-add-homework";
import { groupByCourse } from "@/lib/grouping";

export function DailyView({ onError }) {
  const { t, i18n } = useTranslation();
  const { homework, courses, selectedDate } = useAppData();

  // The context keeps the previously loaded homework when a read fails, and it
  // holds the previous day's entries while the next read is in flight, so the
  // due date has to be checked here: `selectedDate` moves before the data does.
  const groups = groupByCourse(
    homework.filter((item) => item.due_date === selectedDate),
    courses,
    i18n.language,
  );

  return (
    // Keyed on the date so navigating to a different day remounts the section
    // and the fade-in below actually retriggers — without a key, React reuses
    // the same DOM node across days and the animation would only ever play
    // once, on the app's first render.
    <section key={selectedDate} className="group flex animate-in flex-col gap-4 fade-in duration-300">
      {groups.length === 0 ? (
        <EmptyLine>{t("homework.empty")}</EmptyLine>
      ) : (
        groups.map((group) => <CourseGroup key={group.course.id} group={group} onError={onError} />)
      )}
      <QuickAddHomework dueDate={selectedDate} onError={onError} />
    </section>
  );
}
