import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppDataProvider, useAppData } from "@/components/app-data";
import { TopBar } from "@/components/top-bar";
import { DailyView } from "@/components/daily-view";
import { WeeklyView } from "@/components/weekly-view";
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

function MainView() {
  const { t } = useTranslation();
  const { view, error, errorCount } = useAppData();
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

  return (
    <main className="flex-1 p-4">
      {view === "weekly" ? <WeeklyView /> : <DailyView />}
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

  useEffect(() => {
    report(startupError, t("errors.startupFailed"));
  }, [startupError, report, t]);

  const reportWriteFailure = useCallback(
    (failure) => {
      toast.error(t("errors.languageFailed"));
      console.error("a write failed", failure);
    },
    [t],
  );

  return (
    <AppDataProvider>
      <div className="flex min-h-svh flex-col">
        <TopBar onError={reportWriteFailure} />
        <MainView />
      </div>
      <Toaster containerAriaLabel={t("topBar.notifications")} />
    </AppDataProvider>
  );
}

export default App;
