import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataProvider, useAppData } from "@/components/app-data";
import { QuickAddHomework } from "@/components/quick-add-homework";
import i18n from "@/i18n";
import en from "@/i18n/en.json";

const { listCourses, listHomeworkBetween, createHomework } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
  createHomework: vi.fn(),
}));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween, createHomework }));

const MATHS = { id: 1, name: "Maths", archived_at: null };
const ZOOLOGIE = { id: 2, name: "Zoologie", archived_at: null };

beforeEach(async () => {
  listCourses.mockResolvedValue([MATHS, ZOOLOGIE]);
  listHomeworkBetween.mockResolvedValue([]);
  createHomework.mockResolvedValue(3);
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

async function mount(props = {}) {
  const view = render(
    <AppDataProvider today="2026-08-25">
      <QuickAddHomework dueDate="2026-08-25" onError={() => {}} {...props} />
    </AppDataProvider>,
  );
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
  return view;
}

// A harness for the one test that needs to force a context refetch from
// outside `QuickAddHomework` itself — simulating a course getting archived,
// through the side panel, while this draft stays open elsewhere.
function ReloadButton() {
  const { reload } = useAppData();
  return <button onClick={reload}>reload</button>;
}

async function mountWithReload(props = {}) {
  const view = render(
    <AppDataProvider today="2026-08-25">
      <QuickAddHomework dueDate="2026-08-25" onError={() => {}} {...props} />
      <ReloadButton />
    </AppDataProvider>,
  );
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
  return view;
}

const addButton = () => screen.getByRole("button", { name: en.homework.add });
const openDraft = () => fireEvent.click(addButton());

describe("the closed state", () => {
  it("shows only the add button", async () => {
    await mount();

    expect(addButton()).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders no button at all when there is no active course", async () => {
    listCourses.mockResolvedValue([{ id: 1, name: "Maths", archived_at: "2026-01-01T00:00:00Z" }]);

    await mount();

    expect(screen.queryByRole("button", { name: en.homework.add })).toBeNull();
  });
});

describe("opening a draft", () => {
  it("fixes the due date, non-editable, and pre-selects the first active course alphabetically", async () => {
    await mount();

    openDraft();

    expect(screen.getByRole("textbox")).not.toBeNull();
    expect(screen.getByRole("combobox").textContent).toBe("Maths");
    // Non-editable: the due date is plain text, not a button that opens a picker.
    expect(screen.queryByRole("button", { name: en.homework.dueDate })).toBeNull();
    expect(screen.getByText("Tuesday, August 25, 2026")).not.toBeNull();
  });

  it("hides the add button once a draft is open, so a second one cannot be started", async () => {
    await mount();

    openDraft();

    expect(screen.queryByRole("button", { name: en.homework.add })).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});

describe("saving a draft", () => {
  it("creates the entry with the fixed due date, the chosen course and the typed text", async () => {
    await mount();
    openDraft();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Exercices 4 à 7" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Zoologie" }));
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() =>
      expect(createHomework).toHaveBeenCalledWith({
        text: "Exercices 4 à 7",
        dueDate: "2026-08-25",
        courseId: 2,
        createdAt: expect.any(String),
      }),
    );
  });

  it("closes the draft and shows the add button again once saved", async () => {
    await mount();
    openDraft();
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(createHomework).toHaveBeenCalled());
    await waitFor(() => expect(addButton()).not.toBeNull());
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // The default course pre-selected on open can be archived out from under
  // the draft by a concurrent action (the side panel stays reachable while a
  // draft is open) — Save must not silently succeed with it once that's
  // happened.
  it("refuses to save a course that was archived while the draft stayed open", async () => {
    await mountWithReload();
    openDraft();
    // The default pre-selection is "Maths", the first active course
    // alphabetically — that is the one this test archives mid-draft.
    expect(screen.getByRole("combobox").textContent).toBe("Maths");

    listCourses.mockResolvedValue([{ ...MATHS, archived_at: "2026-08-26T00:00:00Z" }, ZOOLOGIE]);
    fireEvent.click(screen.getByRole("button", { name: "reload" }));
    await waitFor(() => expect(listCourses.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(screen.getByText(en.homework.courseRequired)).not.toBeNull());
    expect(createHomework).not.toHaveBeenCalled();
  });

  it("reports a failed create to its caller and keeps the draft open", async () => {
    const onError = vi.fn();
    createHomework.mockRejectedValue(new Error("database is locked"));
    await mount({ onError });
    openDraft();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "brouillon" } });

    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "save"));
    expect(screen.getByDisplayValue("brouillon")).not.toBeNull();
  });
});

describe("discarding a draft", () => {
  it("Cancel discards the draft with no write", async () => {
    await mount();
    openDraft();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "brouillon" } });

    fireEvent.click(screen.getByRole("button", { name: en.homework.cancel }));

    expect(createHomework).not.toHaveBeenCalled();
    expect(addButton()).not.toBeNull();
  });

  it("Escape discards the draft with no write", async () => {
    await mount();
    openDraft();
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "brouillon" } });

    fireEvent.keyDown(field, { key: "Escape" });

    expect(createHomework).not.toHaveBeenCalled();
    expect(addButton()).not.toBeNull();
  });
});
