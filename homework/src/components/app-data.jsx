// The one context holding what the whole application looks at: which date is
// selected, which view is showing, and the courses and homework for that range.
//
// `specs/technical-stack.md`: "No state management library: React hooks plus a
// single context for the shared homework and course data." This is that context.
// Milestones 7 to 9 add mutations on top of it and call `reload`.
//
// What is deliberately NOT here: the language. `useTranslation` already
// subscribes its consumers to i18next's `languageChanged`, so a copy in this
// context would be a second source of truth that drifts from `i18n.language`.
//
// It lives under `src/components/` rather than in a `context/` directory of its
// own because the code layout in `specs/technical-stack.md` does not have one,
// and it is, in the end, a component.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listCourses } from "@/db/courses";
import { listHomeworkBetween } from "@/db/homework";
import {
  isCalendarDate,
  nextDay,
  nextWeek,
  previousDay,
  previousWeek,
  todayDate,
  weekDays,
} from "@/lib/dates";

export const VIEWS = ["daily", "weekly"];

const AppDataContext = createContext(null);

// The dates the visible range covers. Daily is one day — `listHomeworkBetween`
// is inclusive on both ends, so `from === to`. Weekly is the seven days of the
// week containing the selected date, which `weekDays` already answers with
// Monday hard-coded.
export function visibleRange(selectedDate, view) {
  if (view === "weekly") {
    const days = weekDays(selectedDate);
    return { from: days[0], to: days[days.length - 1] };
  }
  return { from: selectedDate, to: selectedDate };
}

export function AppDataProvider({
  children,
  // Injected so a test does not depend on the clock, the same way
  // `startSystemThemeSync` takes `win`.
  today = todayDate(),
  initialView = "daily",
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setViewState] = useState(initialView);
  const [courses, setCourses] = useState([]);
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // `src/db/client.js` caches a rejected `Database.load`, so every read after a
  // failed migration rejects with the *same* `Error` instance. `setError` then
  // bails out of the re-render, and the toast is deduped on error identity — the
  // second failure onwards would be silent while the view says "nothing due".
  // Counting the failures gives each one an identity of its own.
  const [errorCount, setErrorCount] = useState(0);

  const { from, to } = useMemo(
    () => visibleRange(selectedDate, view),
    [selectedDate, view],
  );

  // A reload the effect can depend on without re-running on every render.
  const [reloadCount, setReloadCount] = useState(0);

  // Stepping next several times fires overlapping reads, and the earliest one
  // resolving last would paint stale data over fresh. `cancelled` is what stops
  // it: React runs this effect's cleanup before re-running it, so a read whose
  // range is no longer the visible one can no longer write to state.
  //
  // A sequence-number ref on top of this was tried and removed — the cleanup
  // already fires on every dependency change and on unmount, so the counter
  // could never be the thing that rejected a response. It was dead code that
  // read like a safeguard, which is worse than no safeguard.
  //
  // None of this is concurrency anxiety about other processes: there is exactly
  // one. It is the component racing itself.
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    Promise.all([listCourses(), listHomeworkBetween(from, to)]).then(
      ([loadedCourses, loadedHomework]) => {
        if (cancelled) {
          return;
        }
        // Archived courses are kept: a homework entry keeps displaying the real
        // name of a course the user deleted, muted and sorted last. Filtering to
        // the active ones is the picker's job, not this layer's.
        setCourses(loadedCourses);
        setHomework(loadedHomework);
        setError(null);
        setLoading(false);
      },
      (failure) => {
        if (cancelled) {
          return;
        }
        // `courses` and `homework` are left as they are on purpose. Blanking the
        // view on a failed refresh loses what the student was looking at, on top
        // of telling them it broke.
        setError(failure);
        setErrorCount((count) => count + 1);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [from, to, reloadCount]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  // Radix lets a single-type toggle group deselect its active item, which
  // arrives as an empty string. Storing that would render neither view, so an
  // unknown value is ignored rather than believed.
  const setView = useCallback((next) => {
    if (!VIEWS.includes(next)) {
      return;
    }
    setViewState(next);
  }, []);

  // Throws rather than storing a date the range query would silently turn into
  // an empty result. The picker hands back a `Date` that the caller converts
  // with `fromLocalDate`, so anything malformed here is a bug upstream.
  const selectDate = useCallback((date) => {
    if (!isCalendarDate(date)) {
      throw new Error(`invalid calendar date: ${JSON.stringify(date)}`);
    }
    setSelectedDate(date);
  }, []);

  // The step follows the view, using milestone 5's helpers rather than fresh
  // arithmetic. A week is exactly seven days, never "the same weekday next
  // month", and a day never skips a weekend.
  const goPrevious = useCallback(() => {
    setSelectedDate((date) => (view === "weekly" ? previousWeek(date) : previousDay(date)));
  }, [view]);

  const goNext = useCallback(() => {
    setSelectedDate((date) => (view === "weekly" ? nextWeek(date) : nextDay(date)));
  }, [view]);

  const value = useMemo(
    () => ({
      selectedDate,
      view,
      from,
      to,
      courses,
      homework,
      loading,
      error,
      errorCount,
      setView,
      selectDate,
      goPrevious,
      goNext,
      reload,
    }),
    [selectedDate, view, from, to, courses, homework, loading, error, errorCount, setView, selectDate, goPrevious, goNext, reload],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  // Handing back `undefined` would fail later, somewhere else, as a property
  // read on nothing.
  if (value === null) {
    throw new Error("useAppData must be used inside an AppDataProvider");
  }
  return value;
}
