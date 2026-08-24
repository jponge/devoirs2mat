// The boot step, separated from `main.jsx` so that it can be tested.
//
// `main.jsx` runs its side effects at module scope, which is why nothing may
// import it from a test. That makes the one link actually carrying a startup
// failure to the user — the `startupError` prop — untestable if it lives there,
// and milestone 6's context refactor is exactly the kind of change that would
// quietly drop it.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
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
