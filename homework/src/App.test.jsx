import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "@/App";
import i18n from "@/i18n";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

// The Tauri SQL plugin only exists inside the Tauri runtime, so the data layer
// is faked, as `specs/technical-stack.md` requires for component tests.
const { listCourses, listHomeworkBetween } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
}));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween }));

beforeEach(async () => {
  listCourses.mockResolvedValue([]);
  listHomeworkBetween.mockResolvedValue([]);
  await i18n.changeLanguage("en");
});

// i18next is a shared singleton, so a test that left it in French would leak
// into every file that renders a component afterwards.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

const settle = () => waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());

describe("App", () => {
  it("shows the application name", async () => {
    render(<App />);
    await settle();

    // Never translated, in either language.
    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
  });

  it("starts in the daily view", async () => {
    render(<App />);
    await settle();

    const daily = screen.getByRole("radio", { name: en.view.daily });
    expect(daily.getAttribute("aria-checked")).toBe("true");
  });

  it("shows the muted empty line rather than nothing at all", async () => {
    render(<App />);
    await settle();

    expect(screen.getByText(en.homework.empty)).not.toBeNull();
  });

  it("follows a language change with no remount", async () => {
    render(<App />);
    await settle();
    expect(screen.getByText(en.homework.empty)).not.toBeNull();

    await i18n.changeLanguage("fr");

    expect(screen.getByText(fr.homework.empty)).not.toBeNull();
    expect(screen.queryByText(en.homework.empty)).toBeNull();
  });

  // Translated, not left as a key: a missing catalogue entry renders its own
  // key, which every assertion above would happily accept.
  it("never leaves a translation key on screen", async () => {
    render(<App />);
    await settle();

    expect(screen.queryByText(/^(topBar|view|homework|sidePanel|errors)\./)).toBeNull();
  });
});

describe("App with a startup failure", () => {
  it("still renders the shell, and toasts rather than hiding the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("no such table: settings");

    render(<App startupError={failure} />);
    await settle();

    // A database that cannot be opened must not leave a blank window.
    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByText(en.errors.startupFailed)).not.toBeNull();
    });
  });

  it("says nothing when startup succeeded", async () => {
    render(<App />);
    await settle();

    expect(screen.queryByText(en.errors.startupFailed)).toBeNull();
  });
});

describe("a failing read", () => {
  it("is reported, never silent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listHomeworkBetween.mockRejectedValue(new Error("no such table: homework"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(en.errors.loadFailed)).not.toBeNull();
    });
  });
});
