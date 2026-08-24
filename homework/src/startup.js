// Deciding when the window is allowed to appear.
//
// The language is resolved before the first render so the user never sees a
// flash of the wrong one. That puts a database read — and, the first time, the
// migrations — in front of the only thing they can see, so it is raced against a
// deadline: a database that never answers must not leave someone staring at an
// empty window.
//
// The subtlety is what "the deadline won" means. It does **not** mean the
// database failed. Reporting a failure there would tell a student their data is
// broken because a first-run migration took two seconds on a slow disk, and
// nothing could retract it afterwards. A timeout is therefore reported as a
// timeout, with no error, and the read is left running.
//
// When that late read does arrive it has already applied the stored language
// itself, so the interface flips after paint. That is the flash this whole
// arrangement exists to avoid — but it only happens on a path that is already
// degraded, and the alternative is ignoring the choice the user actually made.
// A real error arriving late is delivered through `onLate` so that it can still
// be reported.
import { startLanguage } from "@/i18n/preference";
import { resolveLanguage, webviewLocales } from "@/i18n/language";

export const STARTUP_DEADLINE_MS = 2000;

export function resolveStartup({
  start = startLanguage,
  deadlineMs = STARTUP_DEADLINE_MS,
  onLate = () => {},
} = {}) {
  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        language: resolveLanguage(null, webviewLocales()),
        error: null,
        timedOut: true,
      });
    }, deadlineMs);

    const finish = (result) => {
      clearTimeout(timer);
      if (settled) {
        onLate(result);
        return;
      }
      settled = true;
      resolve({ ...result, timedOut: false });
    };

    start().then(finish, (failure) => {
      finish({
        language: resolveLanguage(null, webviewLocales()),
        error: failure,
      });
    });
  });
}
