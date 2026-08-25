import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "@/i18n";
import { startLanguage, setLanguage } from "@/i18n/preference";
import { getSetting, setSetting } from "@/db/settings";

// The database layer is faked at the module boundary: the Tauri SQL plugin only
// exists inside the Tauri runtime, and this milestone's contract with it is
// exactly `getSetting` and `setSetting`.
vi.mock("@/db/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

beforeEach(() => {
  getSetting.mockResolvedValue(null);
  setSetting.mockResolvedValue(undefined);
});

// i18next is a shared singleton, so a test that leaves it in French would leak.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("startLanguage", () => {
  it("applies the stored choice", async () => {
    getSetting.mockResolvedValue("fr");

    const { language, error } = await startLanguage(["en-US"]);

    expect(getSetting).toHaveBeenCalledWith("language");
    expect(language).toBe("fr");
    expect(error).toBe(null);
    expect(i18n.resolvedLanguage).toBe("fr");
  });

  it("detects the language when nothing is stored", async () => {
    const { language } = await startLanguage(["fr-FR"]);

    expect(language).toBe("fr");
    expect(i18n.resolvedLanguage).toBe("fr");
  });

  it("never writes anything back on startup", async () => {
    await startLanguage(["fr-FR"]);

    // Detection is not a choice: persisting it here would freeze whichever
    // language happened to be detected at install time.
    expect(setSetting).not.toHaveBeenCalled();
  });

  // The database is opened for the first time here, so this is the startup
  // failure path the functional specifications care about.
  it("still applies the detected language when the database fails", async () => {
    getSetting.mockRejectedValue(new Error("no such table: settings"));

    const { language } = await startLanguage(["fr-FR"]);

    expect(language).toBe("fr");
    expect(i18n.resolvedLanguage).toBe("fr");
  });

  it("returns the database failure rather than swallowing it", async () => {
    const failure = new Error("no such table: settings");
    getSetting.mockRejectedValue(failure);

    const { error } = await startLanguage([]);

    // `App` renders this as a toast. Losing it here would make the
    // failure silent, which the functional specifications forbid.
    expect(error).toBe(failure);
  });
});

describe("setLanguage", () => {
  it("persists the choice and applies it immediately", async () => {
    await setLanguage("fr");

    expect(setSetting).toHaveBeenCalledWith("language", "fr");
    expect(i18n.resolvedLanguage).toBe("fr");
  });

  it("does not change the language when the write fails", async () => {
    setSetting.mockRejectedValue(new Error("readonly database"));

    await expect(setLanguage("fr")).rejects.toThrow("readonly database");

    // The interface must not claim a language the next launch would not honour.
    expect(i18n.resolvedLanguage).toBe("en");
  });

  // This is the only writer of the key. An unsupported value would be stored,
  // normalised away by i18next so nothing looks wrong, and then ignored on the
  // next launch — the user's choice gone with nothing to show for it.
  it("refuses a language it does not support", async () => {
    await expect(setLanguage("de")).rejects.toThrow(/unsupported language/i);

    expect(setSetting).not.toHaveBeenCalledWith("language", "de");
    expect(i18n.resolvedLanguage).toBe("en");
  });
});

describe("the active language and the document", () => {
  it("keeps <html lang> on the language i18next resolved", async () => {
    getSetting.mockResolvedValue("fr");
    await startLanguage([]);
    expect(document.documentElement.getAttribute("lang")).toBe("fr");

    await setLanguage("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });
});
