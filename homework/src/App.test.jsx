import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "@/App";
import i18n from "@/i18n";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

// A smoke test in the literal sense: rendering `App` at all exercises jsdom, the
// JSX transform and the `@/` alias into `@/components/ui/*`. If the tooling is
// mis-wired, this file fails before any assertion is reached.
beforeEach(async () => {
  await i18n.changeLanguage("en");
});

// i18next is a shared singleton, so a test that left it in French would leak
// into every file that renders a component afterwards.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("App", () => {
  it("shows the application name", () => {
    render(<App />);

    // Never translated, in either language.
    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
  });

  it("shows the placeholder card in English", () => {
    render(<App />);

    expect(screen.getByText(en.shell.cardTitle)).not.toBeNull();
    expect(screen.getByText(en.shell.cardDescription)).not.toBeNull();
  });

  it("renders the generated shadcn buttons", () => {
    render(<App />);

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual([
      en.shell.primaryButton,
      en.shell.secondaryButton,
      en.shell.outlineButton,
    ]);
  });

  it("shows the shell in French once the language changes", async () => {
    render(<App />);
    expect(screen.getByText(en.shell.cardTitle)).not.toBeNull();

    await i18n.changeLanguage("fr");

    // No remount, no restart: the change takes effect where the component is.
    expect(screen.getByText(fr.shell.cardTitle)).not.toBeNull();
    expect(screen.queryByText(en.shell.cardDescription)).toBeNull();
  });

  // Translated, not left as a key: a missing catalogue entry renders its own
  // key, which every assertion above would happily accept.
  it("never leaves a translation key on screen", () => {
    render(<App />);

    expect(screen.queryByText(/shell\./)).toBeNull();
  });
});

describe("App with a startup failure", () => {
  it("still renders the shell, and reports the error rather than hiding it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("no such table: settings");

    render(<App startupError={failure} />);

    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
    expect(logged).toHaveBeenCalledWith(expect.any(String), failure);
  });
});
