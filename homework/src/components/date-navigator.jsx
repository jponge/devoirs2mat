// The date selection component and the two buttons around it.
//
// `specs/functional-specs.md`: the date selection component sits at the top,
// surrounded by previous / next day buttons in daily view and previous / next
// week buttons in weekly view. In daily view it shows the selected date; in
// weekly view it shows the Monday-to-Sunday range of the selected week.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppData } from "@/components/app-data";
import { fromLocalDate, toLocalDate, weekDays } from "@/lib/dates";
import { formatFullDate, formatWeekRange } from "@/lib/format-dates";
import { intlFormatters, intlLabels } from "@/lib/calendar-intl";

export function DateNavigator() {
  const { t, i18n } = useTranslation();
  const { selectedDate, view, goPrevious, goNext, selectDate } = useAppData();
  const [open, setOpen] = useState(false);

  const weekly = view === "weekly";
  const days = weekly ? weekDays(selectedDate) : null;
  const label = weekly
    ? formatWeekRange(days[0], days[days.length - 1], i18n.language)
    : formatFullDate(selectedDate, i18n.language);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrevious}
        aria-label={t(weekly ? "topBar.previousWeek" : "topBar.previousDay")}
      >
        <ChevronLeftIcon />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label={t("topBar.chooseDate")}>
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            // Monday, hard-coded, never derived from the locale — the same rule
            // `src/lib/dates.js` follows. A picker that started its weeks on
            // Sunday in English would contradict the weekly view next to it.
            weekStartsOn={1}
            formatters={intlFormatters(i18n.language)}
            labels={intlLabels(i18n.language, t)}
            selected={toLocalDate(selectedDate)}
            defaultMonth={toLocalDate(selectedDate)}
            onSelect={(picked) => {
              // react-day-picker calls back with `undefined` when the selected
              // day is clicked again. There is always a selected date here, so
              // that is a no-op rather than a deselection.
              if (picked === undefined) {
                setOpen(false);
                return;
              }
              // `fromLocalDate` and never `toISOString().slice(0, 10)`: the
              // picker hands back a `Date` at LOCAL midnight, and the UTC round
              // trip answers the previous day in any negative-offset zone.
              selectDate(fromLocalDate(picked));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        aria-label={t(weekly ? "topBar.nextWeek" : "topBar.nextDay")}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
