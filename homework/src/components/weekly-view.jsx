// The weekly view: seven day blocks, Monday to Sunday.
//
// `specs/functional-specs.md` is precise about the layout, so it is worth
// restating: the blocks sit on TWO columns — Monday and Tuesday, then Wednesday
// and Thursday, then Friday on its own with the right-hand cell left empty, then
// Saturday and Sunday. Friday is alone so that the weekend stays paired.
//
// A block grows with its content and never scrolls on its own; the page scrolls.
// Nothing here sets an overflow, deliberately.
import { useTranslation } from "react-i18next";
import { useAppData } from "@/components/app-data";
import { CourseGroup, EmptyLine } from "@/components/course-group";
import { QuickAddHomework } from "@/components/quick-add-homework";
import { groupWeek } from "@/lib/grouping";
import { weekDays } from "@/lib/dates";
import { formatDayHeading } from "@/lib/format-dates";

function DayBlock({ day, language, onError }) {
  const { t } = useTranslation();

  return (
    // No `key` here — it's set by the caller, on the element, the same way
    // `daily-view.jsx` keys its section on the date so the fade-in below
    // retriggers on navigation instead of only ever playing once.
    <section
      data-testid="day-block"
      className="group/day flex animate-in flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs fade-in duration-300"
    >
      <h2 className="text-sm font-semibold">{formatDayHeading(day.date, language)}</h2>
      {day.groups.length === 0 ? (
        <EmptyLine>{t("homework.empty")}</EmptyLine>
      ) : (
        day.groups.map((group) => (
          <CourseGroup key={group.course.id} group={group} onError={onError} />
        ))
      )}
      <QuickAddHomework dueDate={day.date} onError={onError} />
    </section>
  );
}

export function WeeklyView({ onError }) {
  const { i18n } = useTranslation();
  const { selectedDate, homework, courses } = useAppData();

  // The days come from the date range and never from the data, which is what
  // gives a day with no homework its block.
  const dates = weekDays(selectedDate);
  const days = groupWeek(homework, courses, dates, i18n.language);

  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = days;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DayBlock key={monday.date} day={monday} language={i18n.language} onError={onError} />
      <DayBlock key={tuesday.date} day={tuesday} language={i18n.language} onError={onError} />
      <DayBlock key={wednesday.date} day={wednesday} language={i18n.language} onError={onError} />
      <DayBlock key={thursday.date} day={thursday} language={i18n.language} onError={onError} />
      <DayBlock key={friday.date} day={friday} language={i18n.language} onError={onError} />
      {/* The empty right-hand cell that keeps the weekend paired on the row
          below. It carries no content and is not announced. */}
      <div aria-hidden="true" />
      <DayBlock key={saturday.date} day={saturday} language={i18n.language} onError={onError} />
      <DayBlock key={sunday.date} day={sunday} language={i18n.language} onError={onError} />
    </div>
  );
}
