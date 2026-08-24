// The theme follows the system appearance and there is no in-application switch.
//
// The shadcn preset gates its dark palette behind a `.dark` class and emits no
// `prefers-color-scheme` media query at all, so the operating system setting has
// to be mirrored onto the document element or the dark palette is dead code.
//
// The first application happens inline in `index.html`, before first paint, so a
// dark system never flashes the light palette. This module keeps it in sync
// afterwards, and is the single place allowed to own the `.dark` class.

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function applySystemTheme(prefersDark, root) {
  root.classList.toggle("dark", prefersDark);
}

// Returns a function that stops the synchronisation. `win` and `root` are
// injectable so this can be tested without a real browser: jsdom implements
// neither `matchMedia` nor the media query itself.
export function startSystemThemeSync(
  win = window,
  root = document.documentElement,
) {
  if (typeof win.matchMedia !== "function") {
    return () => {};
  }

  const query = win.matchMedia(DARK_QUERY);
  const sync = () => applySystemTheme(query.matches, root);

  sync();

  // `MediaQueryList.addEventListener` is Safari 14+; older WebKit builds only
  // have the deprecated `addListener`. A webview with neither still renders the
  // application, it just stops following the system appearance.
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }
  if (typeof query.addListener === "function") {
    query.addListener(sync);
    return () => query.removeListener(sync);
  }
  return () => {};
}
