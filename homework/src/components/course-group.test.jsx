import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataProvider } from "@/components/app-data";
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

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({
  listHomeworkBetween,
  setHomeworkDone,
  updateHomework,
  deleteHomework,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

const COURSE = { id: 1, name: "Maths", archived_at: null };

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
    await mount(<CourseGroup group={group({ id: 1, name: "Maths", archived_at: null }, [item()])} />);

    expect(screen.getByRole("heading", { name: "Maths" })).not.toBeNull();
  });

  // A homework entry on a course the user deleted keeps the real course name,
  // muted — which is why the course is archived rather than hard-deleted.
  it("mutes the heading of an archived course, and only that one", async () => {
    const active = await mount(
      <CourseGroup group={group({ id: 1, name: "Maths", archived_at: null }, [item()])} />,
    );
    const activeClasses = screen.getByRole("heading", { name: "Maths" }).className;
    active.unmount();

    await mount(
      <CourseGroup
        group={group({ id: 2, name: "Latin", archived_at: "2026-08-01T10:00:00Z" }, [
          item({ id: 2, course_id: 2 }),
        ])}
      />,
    );

    const archivedClasses = screen.getByRole("heading", { name: "Latin" }).className;
    expect(archivedClasses).toContain("text-muted-foreground");
    expect(activeClasses).not.toContain("text-muted-foreground");
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

  it("unwraps an unsupported construct to plain text, with no heading or list element", async () => {
    await mount(<CourseGroup group={group(COURSE, [item({ text: "# Devoir de maths" })])} />);

    const li = screen.getByTestId("homework-item");
    expect(li.querySelector("h1, h2, h3, ul, ol, li")).toBeNull();
    expect(li.textContent).toContain("Devoir de maths");
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

  it("offers the entry's own archived course, muted, and no other archived course", async () => {
    listCourses.mockResolvedValue([
      COURSE,
      { id: 2, name: "Histoire", archived_at: "2026-01-01T00:00:00Z" },
      { id: 3, name: "Latin", archived_at: "2026-01-01T00:00:00Z" },
    ]);
    await mount(
      <CourseGroup group={group({ id: 2, name: "Histoire", archived_at: "2026-01-01T00:00:00Z" }, [
        item({ course_id: 2 }),
      ])} />,
    );
    await openEdit();

    fireEvent.click(screen.getByRole("combobox"));

    const histoire = await screen.findByRole("option", { name: "Histoire" });
    expect(histoire.className).toContain("text-muted-foreground");
    expect(screen.getByRole("option", { name: "Maths" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Latin" })).toBeNull();
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
