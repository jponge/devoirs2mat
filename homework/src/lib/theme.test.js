import { describe, it, expect, vi } from "vitest";
import {
  DARK_QUERY,
  applySystemTheme,
  startSystemThemeSync,
} from "@/lib/theme";

// A stand-in for `document.documentElement`: only the class list is used.
function fakeRoot() {
  return document.createElement("html");
}

// A stand-in for `MediaQueryList` with the modern `addEventListener` API.
// `fire` flips `matches` and notifies whoever is still subscribed.
function modernQuery(matches) {
  const listeners = new Set();
  return {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((type, listener) => {
      if (type === "change") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === "change") {
        listeners.delete(listener);
      }
    }),
    fire(next) {
      matches = next;
      for (const listener of [...listeners]) {
        listener({ matches: next });
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

// A stand-in for an older WebKit `MediaQueryList`: the deprecated API only.
function legacyQuery(matches) {
  const listeners = new Set();
  return {
    get matches() {
      return matches;
    },
    addListener: vi.fn((listener) => listeners.add(listener)),
    removeListener: vi.fn((listener) => listeners.delete(listener)),
    fire(next) {
      matches = next;
      for (const listener of [...listeners]) {
        listener({ matches: next });
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function fakeWin(query) {
  return { matchMedia: vi.fn(() => query) };
}

describe("applySystemTheme", () => {
  it("adds the dark class when the system prefers dark", () => {
    const root = fakeRoot();

    applySystemTheme(true, root);

    expect(root.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class when the system prefers light", () => {
    const root = fakeRoot();
    root.classList.add("dark");

    applySystemTheme(false, root);

    expect(root.classList.contains("dark")).toBe(false);
  });

  // The two cases above each start from the opposite state, so a `toggle("dark")`
  // that ignored its second argument would flip to the expected answer anyway and
  // both would still pass. These start from the state being asked for, so only a
  // genuine set-to-value survives them.
  it("leaves the dark class on when dark is applied twice", () => {
    const root = fakeRoot();
    root.classList.add("dark");

    applySystemTheme(true, root);

    expect(root.classList.contains("dark")).toBe(true);
  });

  it("leaves the dark class off when light is applied twice", () => {
    const root = fakeRoot();

    applySystemTheme(false, root);

    expect(root.classList.contains("dark")).toBe(false);
  });

  it("pins the media query the whole application agrees on", () => {
    expect(DARK_QUERY).toBe("(prefers-color-scheme: dark)");
  });
});

describe("startSystemThemeSync", () => {
  it("applies the dark class immediately when the system prefers dark", () => {
    const query = modernQuery(true);
    const win = fakeWin(query);
    const root = fakeRoot();

    startSystemThemeSync(win, root);

    expect(win.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class immediately when the system prefers light", () => {
    const query = modernQuery(false);
    const root = fakeRoot();
    root.classList.add("dark");

    startSystemThemeSync(fakeWin(query), root);

    expect(root.classList.contains("dark")).toBe(false);
  });

  it("flips the class when the system appearance changes", () => {
    const query = modernQuery(false);
    const root = fakeRoot();

    startSystemThemeSync(fakeWin(query), root);
    expect(root.classList.contains("dark")).toBe(false);

    query.fire(true);
    expect(root.classList.contains("dark")).toBe(true);

    query.fire(false);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("stops following the system once the returned function is called", () => {
    const query = modernQuery(false);
    const root = fakeRoot();

    const stop = startSystemThemeSync(fakeWin(query), root);
    stop();

    expect(query.listenerCount()).toBe(0);

    query.fire(true);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("is a harmless no-op when the window has no matchMedia", () => {
    const root = fakeRoot();

    const stop = startSystemThemeSync({}, root);

    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("falls back to the deprecated addListener API", () => {
    const query = legacyQuery(true);
    const root = fakeRoot();

    const stop = startSystemThemeSync(fakeWin(query), root);
    expect(root.classList.contains("dark")).toBe(true);
    expect(query.addListener).toHaveBeenCalled();

    query.fire(false);
    expect(root.classList.contains("dark")).toBe(false);

    stop();
    expect(query.listenerCount()).toBe(0);

    query.fire(true);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("is a harmless no-op when the media query list has no listener API", () => {
    const root = fakeRoot();
    const query = { matches: true };

    const stop = startSystemThemeSync(fakeWin(query), root);

    // The initial value is still applied; only the subscription is skipped.
    expect(root.classList.contains("dark")).toBe(true);
    expect(() => stop()).not.toThrow();
  });
});

describe("startSystemThemeSync defaults", () => {
  // `main.jsx` calls this with no arguments, so the default parameters are the
  // only code path that ships. Every other test injects both, which would leave
  // `win = window, root = document.documentElement` unexercised.
  it("falls back to the real window and the document element", () => {
    const query = modernQuery(true);
    vi.stubGlobal("matchMedia", vi.fn(() => query));

    const stop = startSystemThemeSync();

    try {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      stop();
      document.documentElement.classList.remove("dark");
    }
  });
});
