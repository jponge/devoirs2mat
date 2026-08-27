import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataProvider, useAppData } from "@/components/app-data";
import { CourseGroup, MarkdownLink } from "@/components/course-group";
import i18n from "@/i18n";
import en from "@/i18n/en.json";

const { listCourses, listHomeworkBetween, setHomeworkDone, updateHomework, deleteHomework } =
  vi.hoisted(() => ({
    listCourses: vi.fn(),
    listHomeworkBetween: vi.fn(),
    setHomeworkDone: vi.fn(),
    updateHomework: vi.fn(),
    deleteHomework: vi.fn(),
  }));
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
const { emitDayCompleted } = vi.hoisted(() => ({ emitDayCompleted: vi.fn() }));
const { playCheckSound, playUncheckSound } = vi.hoisted(() => ({
  playCheckSound: vi.fn(),
  playUncheckSound: vi.fn(),
}));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({
  listHomeworkBetween,
  setHomeworkDone,
  updateHomework,
  deleteHomework,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("@/lib/celebration", () => ({ emitDayCompleted }));
vi.mock("@/lib/sound", () => ({ playCheckSound, playUncheckSound }));

const COURSE = { id: 1, name: "Maths", color: "#22c55e", archived_at: null };

// jsdom normalizes a color assigned to `style.borderColor` (e.g. hex to
// `rgb(...)`) the same way a real browser would, so comparing against a probe
// element sidesteps hardcoding that format here.
function borderColorFor(hex) {
  const probe = document.createElement("div");
  probe.style.borderColor = hex;
  return probe.style.borderColor;
}

const item = (overrides = {}) => ({
  id: 1,
  text: "",
  due_date: "2026-08-25",
  course_id: COURSE.id,
  done: 0,
  created_at: "2026-08-20T08:00:00Z",
  ...overrides,
});

const group = (course, items) => ({ course, homework: items });

// Reads context state `CourseGroup` itself never renders, for the one test
// proving a saved edit updates the in-memory "last used course" that
// `QuickAddHomework` defaults to next — that value has no visible effect
// inside `CourseGroup`'s own markup.
function LastUsedCourseProbe() {
  const { lastUsedCourseId } = useAppData();
  return <div data-testid="last-used-course">{String(lastUsedCourseId)}</div>;
}

beforeEach(async () => {
  listCourses.mockResolvedValue([COURSE]);
  listHomeworkBetween.mockResolvedValue([]);
  setHomeworkDone.mockResolvedValue(undefined);
  updateHomework.mockResolvedValue(undefined);
  deleteHomework.mockResolvedValue(undefined);
  openUrl.mockResolvedValue(undefined);
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

// `CourseGroup` calls `useAppData()` for `reload`, the same way `CourseEditor`
// does — every render needs the provider, even the ones that never touch a
// checkbox or a link.
async function mount(ui) {
  const view = render(<AppDataProvider today="2026-08-25">{ui}</AppDataProvider>);
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
  return view;
}

describe("a course group", () => {
  it("shows the course name", async () => {
    await mount(<CourseGroup group={group({ id: 1, name: "Maths", color: "#22c55e", archived_at: null }, [item()])} />);

    expect(screen.getByRole("heading", { name: "Maths" })).not.toBeNull();
  });

  // A homework entry on a course the user deleted keeps the real course name,
  // muted — which is why the course is archived rather than hard-deleted.
  it("mutes the heading of an archived course, and only that one", async () => {
    const active = await mount(
      <CourseGroup group={group({ id: 1, name: "Maths", color: "#22c55e", archived_at: null }, [item()])} />,
    );
    const activeClasses = screen.getByRole("heading", { name: "Maths" }).className;
    active.unmount();

    await mount(
      <CourseGroup
        group={group({ id: 2, name: "Latin", color: "#ef4444", archived_at: "2026-08-01T10:00:00Z" }, [
          item({ id: 2, course_id: 2 }),
        ])}
      />,
    );

    const archivedClasses = screen.getByRole("heading", { name: "Latin" }).className;
    expect(archivedClasses).toContain("text-muted-foreground");
    expect(activeClasses).not.toContain("text-muted-foreground");
  });

  it("shows the course's color as a left border", async () => {
    await mount(<CourseGroup group={group(COURSE, [item()])} />);

    const section = screen.getByRole("heading", { name: "Maths" }).closest("section");
    expect(section.style.borderColor).toBe(borderColorFor(COURSE.color));
  });

  // Only the heading text is muted for an archived course today (see the
  // test above) — the border must fade the same way rather than the whole
  // section dimming, which would also mute the still-fully-visible cards.
  it("fades the border of an archived course without touching card opacity", async () => {
    await mount(
      <CourseGroup
        group={group(
          { id: 2, name: "Latin", color: "#ef4444", archived_at: "2026-08-01T10:00:00Z" },
          [item({ id: 2, course_id: 2 })],
        )}
      />,
    );

    const section = screen.getByRole("heading", { name: "Latin" }).closest("section");
    expect(section.style.borderColor).not.toBe(borderColorFor("#ef4444"));
    // Two ways this could regress: an inline `opacity` style (jsdom can see
    // this directly), or a Tailwind utility class like `opacity-50` added to
    // the section (jsdom applies no stylesheet, so this never shows up in
    // `style` — it has to be checked in the class list instead, or a
    // class-based regression here would pass unnoticed).
    expect(section.style.opacity).toBe("");
    expect(section.className).not.toMatch(/\bopacity-/);
  });
});

describe("the homework card", () => {
  it("shows a checkbox, unchecked when not done", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ done: 0 })])} />);

    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });

  it("shows the checkbox checked when done", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ done: 1 })])} />);

    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("renders bold, italic, inline code and strikethrough as their real element", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ text: "**bold** *italic* `code` ~~struck~~" })])}
      />,
    );

    const li = screen.getByTestId("homework-item");
    expect(li.querySelector("strong")?.textContent).toBe("bold");
    expect(li.querySelector("em")?.textContent).toBe("italic");
    expect(li.querySelector("code")?.textContent).toBe("code");
    expect(li.querySelector("del")?.textContent).toBe("struck");
  });

  it("unwraps a heading to plain text, with no heading element", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "# Devoir de maths" })])} />);

    const li = screen.getByTestId("homework-item");
    expect(li.querySelector("h1, h2, h3")).toBeNull();
    expect(li.textContent).toContain("Devoir de maths");
  });

  it("renders a bulleted list as a real list, with visible markers", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ text: "Faire exercices :\n\n- 3 page 123\n- 1, 2 et 4 page 125" })])}
      />,
    );

    const li = screen.getByTestId("homework-item");
    const list = li.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list.className).toContain("list-disc");
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("3 page 123");
    expect(items[1].textContent).toBe("1, 2 et 4 page 125");
  });

  it("renders a numbered list as a real list, with visible markers", async () => {
    await mount(
      <CourseGroup group={group(COURSE, [item({ text: "1. Lire le chapitre\n2. Faire le résumé" })])} />,
    );

    const li = screen.getByTestId("homework-item");
    const list = li.querySelector("ol");
    expect(list).not.toBeNull();
    expect(list.className).toContain("list-decimal");
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("Lire le chapitre");
    expect(items[1].textContent).toBe("Faire le résumé");
  });

  it("renders a nested list without special-casing it away", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [
          item({ text: "- Maths\n  - Exercice 3\n  - Exercice 4\n- Français" }),
        ])}
      />,
    );

    const li = screen.getByTestId("homework-item");
    const text = li.querySelector('[data-testid="homework-text"]');
    const outerList = text.querySelector("ul");
    const outerItems = Array.from(outerList.children).filter((child) => child.tagName === "LI");
    expect(outerItems).toHaveLength(2);
    const nestedList = outerList.querySelector("ul");
    expect(nestedList).not.toBeNull();
    expect(nestedList.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders a link with an allowed scheme as a real link", async () => {
    await mount(
      <CourseGroup group={group(COURSE, [item({ text: "[le site](https://example.com)" })])} />,
    );

    const link = screen.getByRole("link", { name: "le site" });
    expect(link.getAttribute("href")).toBe("https://example.com");
  });

  it("does not render a link with a disallowed scheme, but keeps its text", async () => {
    await mount(
      <CourseGroup group={group(COURSE, [item({ text: "[clique](javascript:alert(1))" })])} />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("homework-item").textContent).toContain("clique");
  });

  // `javascript:` alone is a weak case: react-markdown's own default URL
  // transform already blanks it before `MarkdownLink` ever sees it, so a test
  // using only that scheme would still pass with our allow-list deleted
  // entirely. `xmpp:` is a scheme react-markdown's transform lets through
  // unchanged — this is the one that actually exercises `isAllowedLinkScheme`.
  it("does not render a link whose scheme react-markdown itself would let through", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ text: "[discute](xmpp:eleve@example.com)" })])}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("homework-item").textContent).toContain("discute");
  });

  it("mutes and strikes through the text of a completed entry, and not a pending one", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [
          item({ id: 1, done: 1, text: "fini" }),
          item({ id: 2, done: 0, text: "pas fini" }),
        ])}
      />,
    );

    const items = screen.getAllByTestId("homework-item");
    expect(items[0].querySelector(".line-through")).not.toBeNull();
    expect(items[1].querySelector(".line-through")).toBeNull();
  });

  it("renders only the checkbox when text is empty", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "" })])} />);

    const li = screen.getByTestId("homework-item");
    // Asserting the absence of a `p` alone would pass even with the
    // `item.text === "" ? null : (...)` guard deleted entirely: react-markdown
    // renders no `<p>` for an empty string regardless. The text wrapper itself
    // is the thing the guard actually withholds. Scoped to its own
    // `data-testid` rather than a `.text-sm` selector, which the edit/delete
    // buttons' own font-size utility class would also match once they exist.
    expect(li.querySelector('[data-testid="homework-text"]')).toBeNull();
  });
});

describe("MarkdownLink", () => {
  // The whole point of reading `href` from props rather than
  // `node.properties.href` is that they could diverge — today they never do,
  // because react-markdown's URL transform mutates the AST node in place
  // before handing props down, but nothing should depend on that happening to
  // be true. A mismatched `node` proves which source actually drives the
  // component.
  it("uses the href prop even when node.properties.href disagrees", () => {
    render(
      <MarkdownLink
        href="https://good.example"
        node={{ properties: { href: "javascript:alert(1)" } }}
        onError={() => {}}
      >
        le lien
      </MarkdownLink>,
    );

    const link = screen.getByRole("link", { name: "le lien" });
    expect(link.getAttribute("href")).toBe("https://good.example");
  });

  it("never falls back to node.properties.href when the href prop is disallowed", () => {
    render(
      <MarkdownLink
        href="javascript:alert(1)"
        node={{ properties: { href: "https://good.example" } }}
        onError={() => {}}
      >
        le lien
      </MarkdownLink>,
    );

    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("toggling completion", () => {
  it("writes the new value then reloads", async () => {
    listHomeworkBetween.mockResolvedValue([item({ done: 0 })]);
    await mount(<CourseGroup group={group(COURSE, [item({ done: 0 })])} />);
    const before = listHomeworkBetween.mock.calls.length;

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(setHomeworkDone).toHaveBeenCalledWith(1, true));
    await waitFor(() => expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before));
  });

  it("unchecking writes false", async () => {
    listHomeworkBetween.mockResolvedValue([item({ done: 1 })]);
    await mount(<CourseGroup group={group(COURSE, [item({ done: 1 })])} />);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(setHomeworkDone).toHaveBeenCalledWith(1, false));
  });

  it("reports a failed write to its caller rather than silently", async () => {
    const onError = vi.fn();
    setHomeworkDone.mockRejectedValue(new Error("database is locked"));
    listHomeworkBetween.mockResolvedValue([item({ done: 0 })]);
    await mount(<CourseGroup group={group(COURSE, [item({ done: 0 })])} onError={onError} />);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "save"));
  });

  it("fires the celebration when checking the last undone item of the day", async () => {
    const items = [
      item({ id: 1, done: 0, created_at: "2026-08-20T08:00:00Z" }),
      item({ id: 2, done: 1, created_at: "2026-08-20T09:00:00Z" }),
    ];
    listHomeworkBetween.mockResolvedValue(items);
    await mount(<CourseGroup group={group(COURSE, items)} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(emitDayCompleted).toHaveBeenCalledWith("2026-08-25"));
  });

  it("does not fire the celebration while another item due the same day is still undone", async () => {
    const items = [
      item({ id: 1, done: 0, created_at: "2026-08-20T08:00:00Z" }),
      item({ id: 2, done: 0, created_at: "2026-08-20T09:00:00Z" }),
    ];
    listHomeworkBetween.mockResolvedValue(items);
    await mount(<CourseGroup group={group(COURSE, items)} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(setHomeworkDone).toHaveBeenCalled());
    expect(emitDayCompleted).not.toHaveBeenCalled();
  });

  it("does not fire the celebration on uncheck, even for the day's only item", async () => {
    listHomeworkBetween.mockResolvedValue([item({ done: 1 })]);
    await mount(<CourseGroup group={group(COURSE, [item({ done: 1 })])} />);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(setHomeworkDone).toHaveBeenCalledWith(1, false));
    expect(emitDayCompleted).not.toHaveBeenCalled();
  });

  it("plays the check sound on every check, whether or not it celebrates", async () => {
    const items = [
      item({ id: 1, done: 0, created_at: "2026-08-20T08:00:00Z" }),
      item({ id: 2, done: 0, created_at: "2026-08-20T09:00:00Z" }),
    ];
    listHomeworkBetween.mockResolvedValue(items);
    await mount(<CourseGroup group={group(COURSE, items)} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    await waitFor(() => expect(playCheckSound).toHaveBeenCalled());
    expect(playUncheckSound).not.toHaveBeenCalled();
  });

  it("plays the uncheck sound on every uncheck", async () => {
    listHomeworkBetween.mockResolvedValue([item({ done: 1 })]);
    await mount(<CourseGroup group={group(COURSE, [item({ done: 1 })])} />);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(playUncheckSound).toHaveBeenCalled());
    expect(playCheckSound).not.toHaveBeenCalled();
  });
});

describe("opening a link", () => {
  it("opens an allowed link through the opener and does not navigate", async () => {
    await mount(
      <CourseGroup group={group(COURSE, [item({ text: "[le site](https://example.com)" })])} />,
    );

    fireEvent.click(screen.getByRole("link", { name: "le site" }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com"));
  });

  it("reports a failed open to its caller", async () => {
    const onError = vi.fn();
    openUrl.mockRejectedValue(new Error("no browser configured"));
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ text: "[le site](https://example.com)" })])}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "le site" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "link"));
  });
});

// The course a course select offers is not the group's own course: it is the
// full course list from context, which is why `listCourses` is set per test
// here rather than reused from the top-level `beforeEach`.
const openEdit = async () => {
  fireEvent.click(screen.getByRole("button", { name: en.homework.edit }));
  return screen.findByRole("button", { name: en.homework.save });
};

describe("editing a homework entry", () => {
  it("reveals the edit form pre-filled with the entry's current values", async () => {
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ text: "Exercice 4", due_date: "2026-08-25" })])}
      />,
    );

    await openEdit();

    expect(screen.getByDisplayValue("Exercice 4")).not.toBeNull();
    expect(screen.getByRole("combobox").textContent).toBe("Maths");
    expect(screen.getByRole("button", { name: en.homework.dueDate }).textContent).toBe(
      "Tuesday, August 25, 2026",
    );
  });

  it("focuses the text field, the same as a fresh quick-add draft", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);

    await openEdit();

    expect(document.activeElement).toBe(screen.getByDisplayValue("avant"));
  });

  it("commits the typed text and the chosen course on Save, then reloads", async () => {
    listCourses.mockResolvedValue([COURSE, { id: 2, name: "Histoire", archived_at: null }]);
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    const before = listHomeworkBetween.mock.calls.length;
    await openEdit();

    fireEvent.change(screen.getByDisplayValue("avant"), { target: { value: "après" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Histoire" }));
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() =>
      expect(updateHomework).toHaveBeenCalledWith(1, {
        text: "après",
        dueDate: "2026-08-25",
        courseId: 2,
      }),
    );
    // A save that never refetches would leave the student staring at their
    // pre-edit card until an unrelated navigation happened to reload it.
    await waitFor(() => expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before));
  });

  it("restores the original values and writes nothing on Cancel", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    await openEdit();
    fireEvent.change(screen.getByDisplayValue("avant"), { target: { value: "brouillon perdu" } });

    fireEvent.click(screen.getByRole("button", { name: en.homework.cancel }));

    expect(updateHomework).not.toHaveBeenCalled();
    await openEdit();
    expect(screen.getByDisplayValue("avant")).not.toBeNull();
    expect(screen.queryByDisplayValue("brouillon perdu")).toBeNull();
  });

  it("treats Escape as Cancel", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    await openEdit();
    const field = screen.getByDisplayValue("avant");
    fireEvent.change(field, { target: { value: "brouillon perdu" } });

    fireEvent.keyDown(field, { key: "Escape" });

    expect(updateHomework).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: en.homework.save })).toBeNull();
    await openEdit();
    expect(screen.getByDisplayValue("avant")).not.toBeNull();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
  ])("treats %s+Enter as Save", async (_label, modifier) => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    await openEdit();
    const field = screen.getByDisplayValue("avant");
    fireEvent.change(field, { target: { value: "après" } });

    fireEvent.keyDown(field, { key: "Enter", ...modifier });

    await waitFor(() =>
      expect(updateHomework).toHaveBeenCalledWith(1, {
        text: "après",
        dueDate: "2026-08-25",
        courseId: 1,
      }),
    );
  });

  // Plain Enter must keep inserting a newline in the text area — only the
  // modified form of Enter is a save shortcut.
  it("does not treat plain Enter as Save", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    await openEdit();
    const field = screen.getByDisplayValue("avant");

    fireEvent.keyDown(field, { key: "Enter" });

    expect(updateHomework).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.homework.save })).not.toBeNull();
  });

  // A homework entry's own course can already be archived when its edit is
  // opened — not just archived mid-edit (that path is covered below). Either
  // way, the picker never offers an archived course.
  it("does not offer an archived course, including the entry's own", async () => {
    listCourses.mockResolvedValue([
      COURSE,
      { id: 2, name: "Histoire", archived_at: "2026-01-01T00:00:00Z" },
      { id: 3, name: "Latin", archived_at: "2026-01-01T00:00:00Z" },
    ]);
    await mount(
      <CourseGroup group={group({ id: 2, name: "Histoire", color: "#f97316", archived_at: "2026-01-01T00:00:00Z" }, [
        item({ course_id: 2 }),
      ])} />,
    );
    await openEdit();

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.queryByRole("option", { name: "Histoire" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Latin" })).toBeNull();
    expect(screen.getByRole("option", { name: "Maths" })).not.toBeNull();
  });

  // The student must choose an active course before Save works — the same
  // "required" error a never-set course shows — when the entry's own course
  // was already archived before its edit was even opened.
  it("blocks Save until an active course is chosen, when the entry's own course is already archived", async () => {
    listCourses.mockResolvedValue([
      COURSE,
      { id: 2, name: "Histoire", archived_at: "2026-01-01T00:00:00Z" },
    ]);
    await mount(
      <CourseGroup group={group({ id: 2, name: "Histoire", color: "#f97316", archived_at: "2026-01-01T00:00:00Z" }, [
        item({ course_id: 2 }),
      ])} />,
    );
    await openEdit();

    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    expect(await screen.findByText(en.homework.courseRequired)).not.toBeNull();
    expect(updateHomework).not.toHaveBeenCalled();
  });

  it("round-trips a multi-digit course id", async () => {
    listCourses.mockResolvedValue([COURSE, { id: 12, name: "Zoologie", archived_at: null }]);
    await mount(<CourseGroup group={group(COURSE, [item()])} />);
    await openEdit();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Zoologie" }));
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() =>
      expect(updateHomework).toHaveBeenCalledWith(1, expect.objectContaining({ courseId: 12 })),
    );
  });

  // The course the student picked can be archived out from under an open
  // draft by a concurrent action (the side panel stays reachable while a
  // draft is open) — a course that has since disappeared from the picker's
  // own option list must not be allowed to save anyway.
  it("refuses to save a course that was archived while the draft stayed open", async () => {
    const HISTOIRE = { id: 2, name: "Histoire", archived_at: null };
    listCourses.mockResolvedValue([COURSE, HISTOIRE]);
    await mount(
      <CourseGroup
        group={group(COURSE, [item({ id: 1, text: "avant" }), item({ id: 2, done: 0 })])}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: en.homework.edit })[0]);
    await screen.findByRole("button", { name: en.homework.save });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Histoire" }));

    // Histoire gets archived elsewhere; force the same refetch any other
    // write in this list would trigger, by toggling the sibling item — item
    // 1 has no checkbox of its own while its edit form is open.
    listCourses.mockResolvedValue([COURSE, { ...HISTOIRE, archived_at: "2026-08-26T00:00:00Z" }]);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(setHomeworkDone).toHaveBeenCalled());

    // `setHomeworkDone` resolving only proves the write landed — `reload()`
    // itself just bumps a counter synchronously, and the refetch it schedules
    // settles on a later tick. Proceeding to Save immediately races that
    // refetch: under load it can lose, and this test would then validate
    // against the still-stale, still-active course list instead of the one
    // the archive actually left behind. Reopening the combobox and waiting
    // for the list to actually reflect the change is what proves the refetch
    // has landed, not just started.
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Maths" })).not.toBeNull();
      expect(screen.queryByRole("option", { name: "Histoire" })).toBeNull();
    });
    // Dismissed with a pointer, not Escape: this form treats Escape as
    // Cancel, and nothing here should risk closing the edit itself.
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(screen.getByText(en.homework.courseRequired)).not.toBeNull());
    expect(updateHomework).not.toHaveBeenCalled();
  });

  it("reports a failed save to its caller and keeps the draft open", async () => {
    const onError = vi.fn();
    updateHomework.mockRejectedValue(new Error("database is locked"));
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} onError={onError} />);
    await openEdit();
    fireEvent.change(screen.getByDisplayValue("avant"), { target: { value: "après" } });

    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "save"));
    expect(screen.getByDisplayValue("après")).not.toBeNull();
  });

  // A slow first save must not let its continuation reach into whatever edit
  // session happens to be open once it finally resolves — Cancel followed by
  // reopening and typing something new has to be safe from it.
  it("does not let a stale in-flight save close a later, unrelated edit session", async () => {
    let resolveFirstSave;
    updateHomework.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstSave = resolve; }),
    );
    await mount(<CourseGroup group={group(COURSE, [item({ text: "avant" })])} />);
    await openEdit();
    fireEvent.change(screen.getByDisplayValue("avant"), { target: { value: "SAVE1" } });
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));
    await waitFor(() => expect(updateHomework).toHaveBeenCalledTimes(1));

    // Cancel while the first save is still in flight, then reopen and type a
    // second, unrelated draft.
    fireEvent.click(screen.getByRole("button", { name: en.homework.cancel }));
    await openEdit();
    fireEvent.change(screen.getByDisplayValue("avant"), { target: { value: "SAVE2" } });
    const before = listHomeworkBetween.mock.calls.length;

    // The first save resolves only now — its continuation must be a no-op,
    // not close the second draft out from under the student.
    resolveFirstSave(undefined);
    await waitFor(() => expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before));

    expect(screen.getByDisplayValue("SAVE2")).not.toBeNull();
    expect(screen.getByRole("button", { name: en.homework.save })).not.toBeNull();
  });

  // The other trigger the "remember the last used course" feature names,
  // alongside a quick-add save (tested in quick-add-homework.test.jsx):
  // saving an edit that changed the course records it too.
  it("records the newly chosen course as last used, once Save lands", async () => {
    listCourses.mockResolvedValue([COURSE, { id: 2, name: "Histoire", archived_at: null }]);
    await mount(
      <>
        <CourseGroup group={group(COURSE, [item({ text: "avant" })])} />
        <LastUsedCourseProbe />
      </>,
    );
    expect(screen.getByTestId("last-used-course").textContent).toBe("null");
    await openEdit();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Histoire" }));
    fireEvent.click(screen.getByRole("button", { name: en.homework.save }));

    await waitFor(() => expect(updateHomework).toHaveBeenCalled());
    expect(screen.getByTestId("last-used-course").textContent).toBe("2");
  });
});

describe("deleting a homework entry", () => {
  it("opens a confirmation dialog and deletes only once confirmed, then reloads", async () => {
    await mount(<CourseGroup group={group(COURSE, [item()])} />);
    const before = listHomeworkBetween.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: en.homework.delete }));

    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());
    expect(deleteHomework).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: en.homework.deleteConfirm }));

    await waitFor(() => expect(deleteHomework).toHaveBeenCalledWith(1));
    // A delete that never refetches would leave the removed card on screen
    // until an unrelated navigation happened to reload it.
    await waitFor(() => expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before));
  });

  it("leaves the entry and writes nothing when the dialog is cancelled", async () => {
    await mount(<CourseGroup group={group(COURSE, [item()])} />);
    fireEvent.click(screen.getByRole("button", { name: en.homework.delete }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: en.homework.deleteCancel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleteHomework).not.toHaveBeenCalled();
    expect(screen.getByTestId("homework-item")).not.toBeNull();
  });

  it("reports a failed delete to its caller", async () => {
    const onError = vi.fn();
    deleteHomework.mockRejectedValue(new Error("database is locked"));
    await mount(<CourseGroup group={group(COURSE, [item()])} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: en.homework.delete }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: en.homework.deleteConfirm }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), "save"));
  });
});
