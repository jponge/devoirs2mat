// The top bar: the date selection component with its previous / next buttons,
// the segmented Daily / Weekly control, and the button that opens the side
// panel.
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateNavigator } from "@/components/date-navigator";
import { SidePanel } from "@/components/side-panel";
import { useAppData, VIEWS } from "@/components/app-data";

export function TopBar({ onLanguageError, onCourseError, onBackupError, panelOpen, onPanelOpenChange }) {
  const { t } = useTranslation();
  const { view, setView } = useAppData();

  return (
    <header className="flex flex-wrap items-center justify-end gap-3 border-b px-4 py-3">
      {/* The window title already names the application; showing it again here
          was clutter. The heading stays for screen readers, so the document
          still has an `h1` above the `h2` day headings, and is never
          translated in either language. */}
      <h1 className="sr-only">Devoirs2mat</h1>

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
          open={panelOpen}
          onOpenChange={onPanelOpenChange}
        />
      </div>
    </header>
  );
}
