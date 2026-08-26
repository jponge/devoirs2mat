import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AppDataProvider } from "@/components/app-data";
import { CourseEditor } from "@/components/course-editor";
import { COURSE_COLORS } from "@/lib/course-colors";
import { nowInstant } from "@/lib/instants";
import i18n from "@/i18n";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

const { listCourses, createCourse, renameCourse, setCourseColor, archiveCourse, listHomeworkBetween } =
  vi.hoisted(() => ({
    listCourses: vi.fn(),
    createCourse: vi.fn(),
    renameCourse: vi.fn(),
    setCourseColor: vi.fn(),
    archiveCourse: vi.fn(),
    listHomeworkBetween: vi.fn(),
  }));
const { pickRandomCourseColor } = vi.hoisted(() => ({ pickRandomCourseColor: vi.fn() }));

vi.mock("@/db/courses", () => ({
  listCourses,
  createCourse,
  renameCourse,
  setCourseColor,
  archiveCourse,
}));
vi.mock("@/db/homework", () => ({ listHomeworkBetween }));
vi.mock("@/lib/course-colors", async (importOriginal) => ({
  ...(await importOriginal()),
  pickRandomCourseColor,
}));

// Arbitrary stand-ins for whatever `pickRandomCourseColor` returns — kept
// distinct from any real palette hex so a test asserting on one of these never
// coincidentally passes because it happens to match a real swatch.
const RANDOM_1 = "#111111";
const RANDOM_2 = "#222222";

const paletteHex = (key) => COURSE_COLORS.find((color) => color.key === key).hex;
const AMBER_HEX = paletteHex("amber");
const BLUE_HEX = paletteHex("blue");

const MATHS = {
  id: 1,
  name: "Mathématiques",
  color: "#22c55e",
  archived_at: null,
  created_at: "2026-08-01T08:00:00Z",
};
const ZOO = {
  id: 2,
  name: "Zoologie",
  color: "#f97316",
  archived_at: null,
  created_at: "2026-08-02T08:00:00Z",
};
const GONE = {
  id: 3,
  name: "Latin",
  color: "#6b7280",
  archived_at: "2026-08-03T08:00:00Z",
  created_at: "2026-08-01T08:00:00Z",
};

beforeEach(async () => {
  listCourses.mockResolvedValue([MATHS, ZOO]);
  listHomeworkBetween.mockResolvedValue([]);
  createCourse.mockResolvedValue(9);
  renameCourse.mockResolvedValue(undefined);
  setCourseColor.mockResolvedValue(undefined);
  archiveCourse.mockResolvedValue(undefined);
  pickRandomCourseColor.mockReturnValueOnce(RANDOM_1).mockReturnValue(RANDOM_2);
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

async function mount(props = {}) {
  render(
    <AppDataProvider today="2026-08-24">
      <CourseEditor {...props} />
    </AppDataProvider>,
  );
  await waitFor(() => expect(listCourses).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
}

const nameField = () => screen.getByLabelText(en.courses.namePlaceholder);
const rows = () => screen.getAllByRole("listitem");

// An ISO-8601 UTC instant, never a `YYYY-MM-DD` calendar date.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// The shape alone would be satisfied by any hardcoded string that happens to
// look like an instant, so the write is also bracketed between two readings of
// the clock: it has to be the moment of the write, not merely instant-shaped.
function expectWrittenNow(instant, before, after) {
  expect(instant).toMatch(INSTANT);
  expect(instant >= before).toBe(true);
  expect(instant <= after).toBe(true);
}

describe("the course list", () => {
  it("lists the active courses", async () => {
    await mount();

    expect(rows()).toHaveLength(2);
    expect(screen.getByText(MATHS.name)).not.toBeNull();
    expect(screen.getByText(ZOO.name)).not.toBeNull();
  });

  // The soft delete is what keeps a homework entry's course name alive, but the
  // editor has no un-archive action, so an archived course has nothing to offer
  // here.
  it("leaves archived courses out", async () => {
    listCourses.mockResolvedValue([MATHS, GONE]);

    await mount();

    expect(screen.queryByText(GONE.name)).toBeNull();
  });

  // `ORDER BY` compares bytes and would place `Éducation physique` after
  // `Zoologie`. The rows come from `sortCourses`, in the active language.
  it("orders names with localeCompare, not by bytes", async () => {
    listCourses.mockResolvedValue([
      ZOO,
      {
        id: 4,
        name: "Éducation physique",
        color: "#8b5cf6",
        archived_at: null,
        created_at: "2026-08-01T08:00:00Z",
      },
    ]);

    await mount();

    const names = rows().map((row) => row.textContent);
    expect(names[0].startsWith("Éducation physique")).toBe(true);
    expect(names[1].startsWith("Zoologie")).toBe(true);
  });
});

describe("adding a course", () => {
  it("saves the trimmed name with an instant, then re-reads", async () => {
    await mount();
    const before = listCourses.mock.calls.length;
    const startedAt = nowInstant();

    fireEvent.change(nameField(), { target: { value: "  Histoire  " } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
    const [name, color, instant] = createCourse.mock.calls[0];
    expect(name).toBe("Histoire");
    expect(color).toBe(RANDOM_1);
    expectWrittenNow(instant, startedAt, nowInstant());
    // Nothing observes the database: the editor has to ask for the reload.
    await waitFor(() => expect(listCourses.mock.calls.length).toBeGreaterThan(before));
  });

  it("clears the field afterwards", async () => {
    await mount();

    fireEvent.change(nameField(), { target: { value: "Histoire" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(nameField().value).toBe(""));
  });

  // "A problem the student can fix in place ... is reported inline, on the field
  // itself" — never a toast, and never by silently doing nothing.
  it("refuses a blank name inline and writes nothing", async () => {
    await mount();

    fireEvent.change(nameField(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(en.courses.nameEmpty);
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(createCourse).not.toHaveBeenCalled();
  });

  it("refuses a name an active course already has, whatever the case", async () => {
    await mount();

    fireEvent.change(nameField(), { target: { value: "zoologie" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    expect((await screen.findByRole("alert")).textContent).toBe(en.courses.nameDuplicate);
    expect(createCourse).not.toHaveBeenCalled();
  });

  // The unique index is on active names only: a name an archived course left
  // behind is free again.
  it("accepts a name only an archived course has", async () => {
    listCourses.mockResolvedValue([MATHS, GONE]);
    await mount();

    fireEvent.change(nameField(), { target: { value: GONE.name } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a failed write to its caller rather than inline", async () => {
    const onError = vi.fn();
    createCourse.mockRejectedValue(new Error("UNIQUE constraint failed"));
    await mount({ onError });

    fireEvent.change(nameField(), { target: { value: "Histoire" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the add row's color", () => {
  it("shows a random default color on mount", async () => {
    await mount();

    const trigger = screen.getByRole("button", { name: en.courses.colorPickerNew });
    expect(trigger.style.backgroundColor).toBeTruthy();
  });

  it("saves the draft's color alongside the name", async () => {
    await mount();

    fireEvent.change(nameField(), { target: { value: "Histoire" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
    expect(createCourse.mock.calls[0][1]).toBe(RANDOM_1);
  });

  // "so the row is never offering the color that was just used" — the draft
  // gets a fresh call to pickRandomCourseColor() rather than keeping the one
  // that was just saved.
  it("re-seeds with a fresh random color after a successful add", async () => {
    await mount();

    fireEvent.change(nameField(), { target: { value: "Histoire" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(pickRandomCourseColor).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const trigger = screen.getByRole("button", { name: en.courses.colorPickerNew });
      expect(trigger.style.backgroundColor).toBeTruthy();
    });
  });

  it("lets the swatch grid override the random default", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: en.courses.colorPickerNew }));
    fireEvent.click(await screen.findByRole("button", { name: en.colors.amber }));

    fireEvent.change(nameField(), { target: { value: "Histoire" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.add }));

    await waitFor(() => expect(createCourse).toHaveBeenCalledTimes(1));
    expect(createCourse.mock.calls[0][1]).toBe(AMBER_HEX);
  });
});

describe("changing a course's color", () => {
  const trigger = (name) =>
    screen.getByRole("button", { name: en.courses.colorPicker.replace("{{name}}", name) });

  it("shows each active course's current color", async () => {
    await mount();

    expect(trigger(ZOO.name).style.backgroundColor).toBeTruthy();
  });

  it("writes immediately through the swatch grid, then reloads", async () => {
    await mount();
    const before = listCourses.mock.calls.length;

    fireEvent.click(trigger(ZOO.name));
    fireEvent.click(await screen.findByRole("button", { name: en.colors.blue }));

    await waitFor(() => expect(setCourseColor).toHaveBeenCalledWith(ZOO.id, BLUE_HEX));
    await waitFor(() => expect(listCourses.mock.calls.length).toBeGreaterThan(before));
  });

  it("writes immediately through the hex field", async () => {
    await mount();

    fireEvent.click(trigger(ZOO.name));
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);
    fireEvent.change(field, { target: { value: "#123abc" } });

    await waitFor(() => expect(setCourseColor).toHaveBeenCalledWith(ZOO.id, "#123abc"));
  });

  it("reports a failed write to its caller", async () => {
    const onError = vi.fn();
    setCourseColor.mockRejectedValue(new Error("database is locked"));
    await mount({ onError });

    fireEvent.click(trigger(ZOO.name));
    fireEvent.click(await screen.findByRole("button", { name: en.colors.blue }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});

describe("renaming a course", () => {
  const startRename = (name) =>
    fireEvent.click(screen.getByRole("button", { name: en.courses.rename.replace("{{name}}", name) }));

  it("saves the trimmed new name, then re-reads", async () => {
    await mount();
    const before = listCourses.mock.calls.length;
    startRename(ZOO.name);

    const field = screen.getByDisplayValue(ZOO.name);
    fireEvent.change(field, { target: { value: "  Botanique  " } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.saveRename }));

    await waitFor(() => expect(renameCourse).toHaveBeenCalledWith(ZOO.id, "Botanique"));
    await waitFor(() => expect(listCourses.mock.calls.length).toBeGreaterThan(before));
  });

  // Renaming `Zoologie` to `Zoologie` collides with itself unless the course
  // being renamed is excluded from the check.
  it("accepts the name the course already has", async () => {
    await mount();
    startRename(ZOO.name);

    fireEvent.click(screen.getByRole("button", { name: en.courses.saveRename }));

    await waitFor(() => expect(renameCourse).toHaveBeenCalledWith(ZOO.id, ZOO.name));
  });

  it("refuses another active course's name inline and writes nothing", async () => {
    await mount();
    startRename(ZOO.name);

    fireEvent.change(screen.getByDisplayValue(ZOO.name), { target: { value: MATHS.name } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.saveRename }));

    expect((await screen.findByRole("alert")).textContent).toBe(en.courses.nameDuplicate);
    expect(renameCourse).not.toHaveBeenCalled();
  });

  it("reports a failed write to its caller rather than inline", async () => {
    const onError = vi.fn();
    renameCourse.mockRejectedValue(new Error("database is locked"));
    await mount({ onError });
    startRename(ZOO.name);

    fireEvent.change(screen.getByDisplayValue(ZOO.name), { target: { value: "Botanique" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.saveRename }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels without writing", async () => {
    await mount();
    startRename(ZOO.name);

    fireEvent.change(screen.getByDisplayValue(ZOO.name), { target: { value: "Botanique" } });
    fireEvent.click(screen.getByRole("button", { name: en.courses.cancelRename }));

    await waitFor(() => expect(screen.getByText(ZOO.name)).not.toBeNull());
    expect(renameCourse).not.toHaveBeenCalled();
  });

  // Escape belongs to the field while one is open. That it does not also reach
  // the panel is asserted against the real panel, in `shell.test.jsx`.
  it("cancels on Escape", async () => {
    await mount();
    startRename(ZOO.name);

    fireEvent.keyDown(screen.getByDisplayValue(ZOO.name), { key: "Escape" });

    await waitFor(() => expect(screen.getByText(ZOO.name)).not.toBeNull());
    expect(renameCourse).not.toHaveBeenCalled();
  });
});

describe("deleting a course", () => {
  const askDelete = (name) =>
    fireEvent.click(screen.getByRole("button", { name: en.courses.delete.replace("{{name}}", name) }));

  it("asks first, naming the course", async () => {
    await mount();

    askDelete(MATHS.name);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(en.courses.deleteBody)).not.toBeNull();
    expect(dialog.textContent).toContain(MATHS.name);
    expect(archiveCourse).not.toHaveBeenCalled();
  });

  it("archives on confirmation, with an instant, then re-reads", async () => {
    await mount();
    const before = listCourses.mock.calls.length;
    const startedAt = nowInstant();
    askDelete(MATHS.name);
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: en.courses.deleteConfirm }));

    await waitFor(() => expect(archiveCourse).toHaveBeenCalledTimes(1));
    const [id, instant] = archiveCourse.mock.calls[0];
    expect(id).toBe(MATHS.id);
    expectWrittenNow(instant, startedAt, nowInstant());
    await waitFor(() => expect(listCourses.mock.calls.length).toBeGreaterThan(before));
  });

  it("writes nothing when the student backs out", async () => {
    await mount();
    askDelete(MATHS.name);
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: en.courses.deleteCancel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(archiveCourse).not.toHaveBeenCalled();
  });

  it("reports a failed archive to its caller", async () => {
    const onError = vi.fn();
    archiveCourse.mockRejectedValue(new Error("database is locked"));
    await mount({ onError });
    askDelete(MATHS.name);
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: en.courses.deleteConfirm }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});

describe("in French", () => {
  it("translates the editor, including the icon buttons", async () => {
    await mount();

    await i18n.changeLanguage("fr");

    expect(screen.getByRole("button", { name: fr.courses.add })).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: fr.courses.delete.replace("{{name}}", MATHS.name),
      }),
    ).not.toBeNull();
    expect(screen.getByLabelText(fr.courses.namePlaceholder)).not.toBeNull();
  });
});
