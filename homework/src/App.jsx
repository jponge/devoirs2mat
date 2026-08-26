import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppDataProvider, useAppData } from "@/components/app-data";
import { TopBar } from "@/components/top-bar";
import { DailyView } from "@/components/daily-view";
import { WeeklyView } from "@/components/weekly-view";
import { Button } from "@/components/ui/button";
import { isActiveCourse } from "@/lib/courses";
// Imported for its side effect: i18next has to be initialised before any
// component calls `useTranslation`, and depending on the import order of
// whoever renders this component would be a trap.
import "@/i18n";

// Reports a failure the student cannot act on where they are, as
// `specs/functional-specs.md` requires. A failure is never silent.
//
// The deduplication is not decoration. `boot.jsx` renders under `StrictMode`,
// which mounts effects twice in development, so a plain `useEffect` would raise
// every startup toast twice. A ref survives that remount; the error identity is
// the key, so a *different* failure later still gets reported.
function useReportedOnce() {
  const reported = useRef(new Set());
  return useCallback((error, message) => {
    if (error === null || error === undefined || reported.current.has(error)) {
      return;
    }
    reported.current.add(error);
    toast.error(message);
    // Kept alongside the toast rather than replaced by it: the toast is what the
    // student sees, the console is where the stack survives for whoever is
    // debugging.
    console.error(message, error);
  }, []);
}

// The first-run state: a course is mandatory, so homework cannot exist until
// one does. `specs/functional-specs.md` requires the explanation and the button
// that opens the side panel on the course editor.
function NoCourses({ onAddCourse }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h2 className="text-lg font-medium">{t("courses.noneTitle")}</h2>
      <p className="max-w-sm text-sm whitespace-pre-line text-muted-foreground">{t("courses.noneBody")}</p>
      <Button onClick={onAddCourse}>{t("courses.noneAction")}</Button>
    </div>
  );
}

function MainView({ onAddCourse, onHomeworkError }) {
  const { t } = useTranslation();
  const { view, courses, loaded, error, errorCount } = useAppData();
  const report = useReportedOnce();

  // A read that failed is a failure the student cannot act on, so it toasts.
  // The view keeps whatever it was already showing.
  //
  // The key is the failure *count*, not the error: a cached rejection hands back
  // the same `Error` object every time, and keying on it would report the first
  // failure and stay quiet for the rest of the session. The count still dedupes
  // StrictMode's double mount, which is all the ref is there for.
  useEffect(() => {
    if (errorCount === 0) {
      return;
    }
    report(errorCount, t("errors.loadFailed"));
    console.error("a read failed", error);
  }, [errorCount, error, report, t]);

  // Neither view has to know about the empty state, which is why it branches
  // here. It waits for the first read to settle — `loaded`, not `loading`, so a
  // later refetch cannot blink it away — and stays away after a failure: a
  // database that could not be read is not a student with no courses, and
  // telling them to create one would be a lie.
  // Active courses, not all of them: the context deliberately keeps archived
  // rows so a homework entry can still show its course name. Counting those
  // here would strand a student who deleted their only course in a view with no
  // way back to the button that creates one.
  const firstRun = !courses.some(isActiveCourse) && loaded && errorCount === 0;

  return (
    <main className="flex-1 p-4">
      {firstRun ? (
        <NoCourses onAddCourse={onAddCourse} />
      ) : view === "weekly" ? (
        <WeeklyView onError={onHomeworkError} />
      ) : (
        <DailyView onError={onHomeworkError} />
      )}
    </main>
  );
}

// `startupError` is the database failure `startLanguage` caught, or `null`. It
// stays a **prop** threaded from `boot.jsx`, deliberately: moving it into the
// shared context is exactly how the only link carrying a startup failure to the
// user would get dropped, and `src/boot.test.jsx` exists to catch that.
//
// The application renders either way — a database that cannot be opened must not
// leave the student in front of a blank window.
function App({ startupError = null }) {
  const { t } = useTranslation();
  const report = useReportedOnce();
  // The panel's open state is lifted here because the first-run empty state
  // opens it from the main view, which is not inside it.
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    report(startupError, t("errors.startupFailed"));
  }, [startupError, report, t]);

  // The language switch's own message: naming what failed is more useful than
  // the generic one below, and it has exactly one caller, so there is no risk
  // of it leaking onto an unrelated failure.
  const reportLanguageFailure = useCallback(
    (failure) => {
      toast.error(t("errors.languageFailed"));
      console.error("a write failed", failure);
    },
    [t],
  );

  // The generic write-failure reporter: homework saves and deletes, a link
  // that would not open, and course create/rename/archive all funnel through
  // here, since none of those has copy specific enough to be worth its own
  // message the way the language switch does.
  const reportWriteFailure = useCallback(
    (failure, kind) => {
      toast.error(t(kind === "link" ? "errors.linkFailed" : "errors.saveFailed"));
      console.error("a write failed", failure);
    },
    [t],
  );

  // `kind` is always the exact suffix of its own `backup.*` catalog key
  // (`"exportFailed"`, `"importRefused"`, `"importFailed"`), set that way by
  // `BackupPanel` precisely so no lookup table has to live here.
  const reportBackupFailure = useCallback(
    (failure, kind) => {
      toast.error(t(`backup.${kind}`));
      console.error("a write failed", failure);
    },
    [t],
  );

  return (
    <AppDataProvider>
      <div className="flex min-h-svh flex-col">
        <TopBar
          onLanguageError={reportLanguageFailure}
          onCourseError={reportWriteFailure}
          onBackupError={reportBackupFailure}
          panelOpen={panelOpen}
          onPanelOpenChange={setPanelOpen}
        />
        <MainView onAddCourse={() => setPanelOpen(true)} onHomeworkError={reportWriteFailure} />
      </div>
      <Toaster containerAriaLabel={t("topBar.notifications")} />
    </AppDataProvider>
  );
}

export default App;
