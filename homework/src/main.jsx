import "@/index.css";
import { boot, reportLateStartupFailure } from "@/boot";
import { resolveStartup } from "@/startup";

// Nothing about startup may end with a blank window, so `resolveStartup` always
// settles: with the resolved language, or with the detected one once its
// deadline passes. A failure that only arrives afterwards still has to reach the
// user, which is what `onLate` is for. Both paths end in a toast.
//
// This file stays a few lines on purpose: it runs its side effects at module
// scope, so no test can import it, and everything it does lives in `@/boot`
// where a test can reach it.
resolveStartup({
  onLate: ({ error }) => reportLateStartupFailure(error),
}).then(({ error }) => {
  boot(document.getElementById("root"), error);
});
