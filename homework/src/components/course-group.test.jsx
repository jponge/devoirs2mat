import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDataProvider } from "@/components/app-data";
import { CourseGroup, MarkdownLink } from "@/components/course-group";
import i18n from "@/i18n";

const { listCourses, listHomeworkBetween, setHomeworkDone } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
  setHomeworkDone: vi.fn(),
}));
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween, setHomeworkDone }));
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
    // (`text-sm`) is the thing the guard actually withholds.
    expect(li.querySelector(".text-sm")).toBeNull();
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
