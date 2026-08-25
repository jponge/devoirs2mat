// The boot step, separated from `main.jsx` so that it can be tested.
//
// `main.jsx` runs its side effects at module scope, which is why nothing may
// import it from a test. That makes the one link actually carrying a startup
// failure to the user — the `startupError` prop — untestable if it lives there,
// and the shared context is exactly the kind of refactor that would quietly
// drop it. It stays a prop for that reason.
import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import App from "@/App";
import i18n from "@/i18n";
import { startSystemThemeSync } from "@/lib/theme";

// Returns the React root so a test can unmount it; leaked roots are a classic
// source of intermittent failures once effects do real work.
export function boot(container, startupError = null) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App startupError={startupError} />
    </React.StrictMode>,
  );

  // Started after the first render on purpose: a webview that cannot mirror the
  // system appearance must still show the application rather than a blank
  // window.
  startSystemThemeSync();

  return root;
}

// The startup failure that arrived AFTER the deadline, through `resolveStartup`'s
// `onLate`. By then `App` has already rendered with no error — the deadline
// settled with the detected language — so nothing downstream will ever report
// it, and `specs/functional-specs.md` is explicit that a failure is never
// silent.
//
// Toasting from outside React works because sonner keeps its queue in a
// module-level store: the mounted `<Toaster>` picks this up wherever it is
// raised from.
export function reportLateStartupFailure(error) {
  if (error === undefined || error === null) {
    return;
  }
  toast.error(i18n.t("errors.startupFailed"));
  console.error("the database answered late, with an error", error);
}
