import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataProvider } from "@/components/app-data";
import { BackupPanel } from "@/components/backup-panel";
import { generateExport, SqlImportError } from "@/lib/sql-export";
import { SCHEMA_VERSION } from "@/db/schema";
import { todayDate } from "@/lib/dates";
import i18n from "@/i18n";
import en from "@/i18n/en.json";

const { listCourses, listHomeworkBetween } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
}));
const { exportDatabase, importDatabase } = vi.hoisted(() => ({
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
}));
const { save, open } = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
const { writeTextFile, readTextFile } = vi.hoisted(() => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));
const { startLanguage } = vi.hoisted(() => ({ startLanguage: vi.fn() }));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween }));
vi.mock("@/db/backup", () => ({ exportDatabase, importDatabase }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save, open }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile, readTextFile }));
vi.mock("@/i18n/preference", () => ({ startLanguage }));

const VALID_EXPORT = generateExport(
  [{ id: 1, name: "Maths", archived_at: null, created_at: "2026-08-01T09:00:00Z" }],
  [],
  [],
);

beforeEach(async () => {
  listCourses.mockResolvedValue([{ id: 1, name: "Maths", archived_at: null }]);
  listHomeworkBetween.mockResolvedValue([]);
  exportDatabase.mockResolvedValue(VALID_EXPORT);
  importDatabase.mockResolvedValue(undefined);
  save.mockResolvedValue("/tmp/devoirs-2026-08-26.sql");
  open.mockResolvedValue("/tmp/chosen.sql");
  writeTextFile.mockResolvedValue(undefined);
  readTextFile.mockResolvedValue(VALID_EXPORT);
  startLanguage.mockResolvedValue({ language: "en", error: null });
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

async function mount(props = {}) {
  const view = render(
    <AppDataProvider today="2026-08-25">
      <BackupPanel onError={() => {}} {...props} />
    </AppDataProvider>,
  );
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
  return view;
}

describe("exporting", () => {
  it("suggests a dated filename and writes the exported text to the chosen path", async () => {
    await mount();

    fireEvent.click(screen.getByRole("button", { name: en.backup.export }));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalled());
    // `todayDate()` reads the real clock, not the `AppDataProvider`'s own
    // `today` prop — a hard-coded date string here would only coincidentally
    // match on the day this test happens to run.
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: `devoirs-${todayDate()}.sql` }),
    );
    expect(writeTextFile).toHaveBeenCalledWith("/tmp/devoirs-2026-08-26.sql", VALID_EXPORT);
  });

  it("does nothing when the save dialog is cancelled", async () => {
    save.mockResolvedValue(null);
    await mount();

    fireEvent.click(screen.getByRole("button", { name: en.backup.export }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(exportDatabase).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("reports a failed write to its caller", async () => {
    const onError = vi.fn();
    writeTextFile.mockRejectedValue(new Error("disk full"));
    await mount({ onError });

    fireEvent.click(screen.getByRole("button", { name: en.backup.export }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "exportFailed"));
  });
});

describe("importing", () => {
  it("validates the file before ever showing the confirmation dialog", async () => {
    await mount();

    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));

    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());
    expect(screen.getByText(en.backup.confirmTitle)).not.toBeNull();
    expect(importDatabase).not.toHaveBeenCalled();
  });

  it("does nothing when the open dialog is cancelled", async () => {
    open.mockResolvedValue(null);
    await mount();

    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(readTextFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("refuses a bad file without ever showing the confirmation dialog", async () => {
    const onError = vi.fn();
    readTextFile.mockResolvedValue("not a devoirs export");
    await mount({ onError });

    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.any(SqlImportError), "importRefused"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(importDatabase).not.toHaveBeenCalled();
  });

  it("refuses a mismatched schema version the same way", async () => {
    const onError = vi.fn();
    readTextFile.mockResolvedValue(`-- devoirs schema-version: ${SCHEMA_VERSION + 1}\n`);
    await mount({ onError });

    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.any(SqlImportError), "importRefused"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("imports, re-resolves the language, and reloads once confirmed", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());
    const before = listHomeworkBetween.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: en.backup.confirmAction }));

    await waitFor(() => expect(importDatabase).toHaveBeenCalledWith(VALID_EXPORT));
    await waitFor(() => expect(startLanguage).toHaveBeenCalled());
    await waitFor(() => expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before));
  });

  it("does nothing when the confirmation dialog is cancelled", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: en.backup.confirmCancel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(importDatabase).not.toHaveBeenCalled();
  });

  it("reports a failed restore to its caller", async () => {
    const onError = vi.fn();
    importDatabase.mockRejectedValue(new Error("database is locked"));
    await mount({ onError });
    fireEvent.click(screen.getByRole("button", { name: en.backup.import }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: en.backup.confirmAction }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "importFailed"));
  });
});
