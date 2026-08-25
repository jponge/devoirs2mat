// React Testing Library only unmounts between tests automatically when vitest's
// `globals` are enabled. They are deliberately off here (see `vite.config.js`),
// so the cleanup is registered explicitly instead.
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { toast } from "sonner";

afterEach(cleanup);

// sonner keeps its toasts in a MODULE-LEVEL store that `cleanup` knows nothing
// about. Unmounting the `<Toaster>` therefore leaves the queue intact, and the
// next test to mount one re-renders every toast the previous tests raised — so
// a test asserting "no toast" fails because of its neighbours, and a test
// counting toasts counts theirs too. Dismissing between tests is what makes
// them independent.
// Guarded on having a DOM: this setup file also runs for the tests carrying a
// `// @vitest-environment node` docblock, where there is no window, no
// `requestAnimationFrame` and no `<Toaster>` to leak into in the first place.
afterEach(async () => {
  if (typeof window === "undefined") {
    return;
  }
  toast.dismiss();
  // The removal is deferred to an animation frame, so the store is only really
  // empty on the other side of one.
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
});

// A test that installs fake timers and forgets to restore them corrupts or
// hangs every file that runs after it, which is miserable to trace back.
afterEach(() => vi.useRealTimers());

// Browser APIs jsdom does not implement, needed by the third-party components
// behind the shadcn preset. `specs/technical-stack.md` predicts this and calls
// it expected rather than a bug to investigate.
//
// Each one is here because a test failed without it, never pre-emptively: a
// polyfill for an API nothing uses outlives the reason it was added and nobody
// dares delete it.

// sonner's `<Toaster>` resolves `theme="system"` by asking for the media query
// itself. Unlike `startSystemThemeSync`, which takes an injectable `win`
// precisely so it needs no global, it is third-party and there is nowhere to
// inject.
//
// This does NOT weaken `src/lib/theme.test.js`: that file builds its own
// `fakeWin` and passes it explicitly, so it never reaches this stub. Matching
// nothing keeps the default light, which is what a test asserting on a colour
// would need — and no test asserts on one, by the rule that colours need a real
// browser.
if (typeof window !== "undefined" && window.matchMedia === undefined) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
