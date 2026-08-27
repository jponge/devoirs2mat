// The top bar: the date selection component with its previous / next buttons,
// the segmented Daily / Weekly control, and the button that opens the side
// panel.
import { useTranslation } from "react-i18next";
import { CircleCheckBigIcon, LightbulbIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateNavigator } from "@/components/date-navigator";
import { SidePanel } from "@/components/side-panel";
import { useAppData, VIEWS } from "@/components/app-data";

export function TopBar({
  onLanguageError,
  onCourseError,
  onBackupError,
  onExportSuccess,
  onAboutError,
  panelOpen,
  onPanelOpenChange,
}) {
  const { t } = useTranslation();
  const { view, setView, homework, from, to } = useAppData();
  // `homework` can briefly hold the previous range's entries while a fetch for
  // the new one is in flight, or after a failed reload — `daily-view.jsx` and
  // `weekly-view.jsx` both filter against the range for the same reason,
  // rather than trusting the array's contents directly.
  const remaining = homework.filter(
    (item) => item.due_date >= from && item.due_date <= to && item.done !== 1,
  ).length;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 shadow-xs">
      {/* The window title already names the application; showing it again here
          was clutter. The heading stays for screen readers, so the document
          still has an `h1` above the `h2` day headings, and is never
          translated in either language. */}
      <h1 className="sr-only">Devoirs</h1>

      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {remaining > 0 ? (
          <>
            <LightbulbIcon className="size-4 shrink-0" aria-hidden="true" />
            {t("topBar.remaining", { count: remaining })}
          </>
        ) : (
          <>
            <CircleCheckBigIcon className="size-4 shrink-0" aria-hidden="true" />
            {t("topBar.remainingNone")}
          </>
        )}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <DateNavigator />

        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          // Radix allows the active item of a single-type group to be
          // deselected, which arrives as "". `setView` ignores anything that is
          // not a known view, so switching to neither is impossible.
          onValueChange={setView}
        >
          {VIEWS.map((name) => (
            <ToggleGroupItem key={name} value={name}>
              {t(`view.${name}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <SidePanel
          onLanguageError={onLanguageError}
          onCourseError={onCourseError}
          onBackupError={onBackupError}
          onExportSuccess={onExportSuccess}
          onAboutError={onAboutError}
          open={panelOpen}
          onOpenChange={onPanelOpenChange}
        />
      </div>
    </header>
  );
}
