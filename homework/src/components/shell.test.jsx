import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "@/App";
import i18n from "@/i18n";
import { formatFullDate, formatWeekRange } from "@/lib/format-dates";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

const { listCourses, listHomeworkBetween, setHomeworkDone } = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listHomeworkBetween: vi.fn(),
  setHomeworkDone: vi.fn(),
}));
const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));

vi.mock("@/db/courses", () => ({ listCourses }));
vi.mock("@/db/homework", () => ({ listHomeworkBetween, setHomeworkDone }));
// `setLanguage` is the real bridge to the database; the panel is tested against
// the call, not against a write it cannot perform here.
vi.mock("@/i18n/preference", () => ({ setLanguage }));

beforeEach(async () => {
  // At least one course, deliberately: with none, the main view shows the
  // first-run empty state instead of the day or the week.
  listCourses.mockResolvedValue([{ id: 1, name: "Maths", archived_at: null }]);
  listHomeworkBetween.mockResolvedValue([]);
  setHomeworkDone.mockResolvedValue(undefined);
  setLanguage.mockImplementation(async (language) => {
    await i18n.changeLanguage(language);
  });
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

async function mount() {
  render(<App />);
  await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
}

const lastRange = () => listHomeworkBetween.mock.calls.at(-1);
const dateButton = () => screen.getByRole("button", { name: en.topBar.chooseDate });
const frDateButton = () => screen.getByRole("button", { name: fr.topBar.chooseDate });
const goWeekly = () => fireEvent.click(screen.getByRole("radio", { name: en.view.weekly }));

describe("the top bar", () => {
  it("labels the step buttons for the day in daily view", async () => {
    await mount();

    expect(screen.getByRole("button", { name: en.topBar.previousDay })).not.toBeNull();
    expect(screen.getByRole("button", { name: en.topBar.nextDay })).not.toBeNull();
    expect(screen.queryByRole("button", { name: en.topBar.nextWeek })).toBeNull();
  });

  // The step follows the current view, which is the whole reason the labels
  // change with it.
  it("labels them for the week in weekly view", async () => {
    await mount();

    goWeekly();

    expect(screen.getByRole("button", { name: en.topBar.previousWeek })).not.toBeNull();
    expect(screen.queryByRole("button", { name: en.topBar.nextDay })).toBeNull();
  });

  it("steps by a day, then re-reads that day", async () => {
    await mount();
    const [startFrom] = lastRange();

    fireEvent.click(screen.getByRole("button", { name: en.topBar.nextDay }));

    await waitFor(() => expect(lastRange()[0]).not.toBe(startFrom));
    const [from, to] = lastRange();
    // Daily is a single inclusive day.
    expect(from).toBe(to);
  });

  it("steps by exactly seven days in weekly view", async () => {
    await mount();
    goWeekly();
    await waitFor(() => expect(lastRange()[0]).not.toBe(lastRange()[1]));
    const [firstMonday] = lastRange();

    fireEvent.click(screen.getByRole("button", { name: en.topBar.nextWeek }));

    await waitFor(() => expect(lastRange()[0]).not.toBe(firstMonday));
    const [monday, sunday] = lastRange();
    const days = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
    expect(days(firstMonday, monday)).toBe(7);
    expect(days(monday, sunday)).toBe(6);
  });

  it("keeps the selected date when the view changes", async () => {
    await mount();
    const before = dateButton().textContent;

    goWeekly();
    // The label becomes a week range, so the date itself is checked through the
    // range that gets queried rather than through the label.
    const [monday, sunday] = lastRange();
    fireEvent.click(screen.getByRole("radio", { name: en.view.daily }));

    await waitFor(() => expect(dateButton().textContent).toBe(before));
    expect(monday <= sunday).toBe(true);
  });

  // Radix lets a single-type toggle group deselect its active item. Storing
  // that empty value would leave neither view rendered.
  it("stays on the current view when the active one is clicked again", async () => {
    await mount();
    goWeekly();
    expect(screen.getByRole("radio", { name: en.view.weekly }).getAttribute("aria-checked")).toBe("true");

    goWeekly();

    expect(screen.getByRole("radio", { name: en.view.weekly }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByTestId("day-block")).toHaveLength(7);
  });

  it("shows a week range in weekly view and a single date in daily view", async () => {
    await mount();
    const daily = dateButton().textContent;

    goWeekly();

    const weekly = dateButton().textContent;
    expect(weekly).not.toBe(daily);
    // `formatRange` separates the ends with a thin-space-padded en dash.
    expect(weekly).toContain("–");
  });

  // The `Intl` layer is pinned in both languages by `format-dates.test.js`, but
  // that proves nothing about the argument the call site passes. Hard-coding
  // `"en"` there leaves the French interface showing English dates.
  it("formats the date button with Intl in the active language", async () => {
    await mount();

    await i18n.changeLanguage("fr");

    expect(frDateButton().textContent).toBe(formatFullDate(lastRange()[0], "fr"));
  });

  it("formats the week range and the day headings in the active language", async () => {
    await mount();
    goWeekly();
    await waitFor(() => expect(lastRange()[0]).not.toBe(lastRange()[1]));

    await i18n.changeLanguage("fr");

    const [monday, sunday] = lastRange();
    expect(frDateButton().textContent).toBe(formatWeekRange(monday, sunday, "fr"));
    const headings = screen
      .getAllByTestId("day-block")
      .map((block) => block.querySelector("h2").textContent);
    expect(headings[0].startsWith("lundi")).toBe(true);
    expect(headings[6].startsWith("dimanche")).toBe(true);
  });

  // The two landmarks a screen reader announces come from libraries, not from
  // our own markup, so they are the ones that quietly stay English.
  it("translates the calendar and notification landmarks", async () => {
    await mount();
    await i18n.changeLanguage("fr");

    fireEvent.click(frDateButton());

    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: fr.topBar.calendarNav })).not.toBeNull(),
    );
    // sonner appends its own hotkey hint to the label it is given.
    expect(
      document.querySelector(`[aria-label^="${fr.topBar.notifications}"]`),
    ).not.toBeNull();
  });

  it("translates the whole bar", async () => {
    await mount();

    await i18n.changeLanguage("fr");

    expect(screen.getByRole("radio", { name: fr.view.weekly })).not.toBeNull();
    expect(screen.getByRole("button", { name: fr.topBar.nextDay })).not.toBeNull();
  });
});

describe("the date picker", () => {
  it("opens from the date button", async () => {
    await mount();

    fireEvent.click(dateButton());

    await waitFor(() => expect(screen.getByRole("dialog")).not.toBeNull());
    expect(screen.getByRole("grid")).not.toBeNull();
  });

  // react-day-picker marks the weekday row `aria-hidden`, so the header cells
  // carry no `columnheader` role and have to be read from the DOM.
  const weekdayNames = () =>
    [...screen.getByRole("grid").querySelectorAll("th")].map((cell) => cell.textContent);

  // Monday is hard-coded and never derived from the locale: a picker starting
  // its weeks on Sunday in English would contradict the weekly view beside it.
  it("starts its weeks on Monday", async () => {
    await mount();
    fireEvent.click(dateButton());
    await waitFor(() => expect(screen.getByRole("grid")).not.toBeNull());

    const headers = weekdayNames();

    expect(headers).toHaveLength(7);
    expect(headers[0].startsWith("Mon")).toBe(true);
    expect(headers[6].startsWith("Sun")).toBe(true);
  });

  it("still starts them on Monday in French", async () => {
    await mount();
    await i18n.changeLanguage("fr");

    fireEvent.click(screen.getByRole("button", { name: fr.topBar.chooseDate }));

    await waitFor(() => expect(screen.getByRole("grid")).not.toBeNull());
    const headers = weekdayNames();
    // Localised through `Intl`, not through a date-fns locale object.
    expect(headers[0].startsWith("lun")).toBe(true);
    expect(headers[6].startsWith("dim")).toBe(true);
  });

  it("names the month in the active language", async () => {
    await mount();
    await i18n.changeLanguage("fr");

    fireEvent.click(screen.getByRole("button", { name: fr.topBar.chooseDate }));

    await waitFor(() => expect(screen.getByRole("grid")).not.toBeNull());
    // The ARIA label too, not only the caption on screen: react-day-picker
    // builds it from its own labels, which stay English unless they are given
    // `Intl` versions as well.
    expect(screen.getByRole("grid").getAttribute("aria-label")).toMatch(
      /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/,
    );
  });

  it("selects the day that was clicked, and re-reads it", async () => {
    await mount();
    fireEvent.click(dateButton());
    await waitFor(() => expect(screen.getByRole("grid")).not.toBeNull());

    // The gridcell carries the day as a calendar date; the button inside it
    // carries a locale-formatted one, which is not what the range is keyed on.
    const cell = [...screen.getByRole("grid").querySelectorAll("td[data-day]")].find(
      (td) => td.getAttribute("data-outside") === null,
    );
    const picked = cell.getAttribute("data-day");
    expect(picked).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(cell.querySelector("button"));

    // The picker hands back a `Date` at local midnight; converting it through
    // `toISOString()` instead of `fromLocalDate` would query the day before in
    // any negative-offset zone.
    await waitFor(() => {
      const [from, to] = lastRange();
      expect(from).toBe(picked);
      expect(to).toBe(picked);
    });
  });

  it("closes the calendar once a day is picked", async () => {
    await mount();
    fireEvent.click(dateButton());
    await waitFor(() => expect(screen.getByRole("grid")).not.toBeNull());
    const cell = [...screen.getByRole("grid").querySelectorAll("td[data-day]")].find(
      (td) => td.getAttribute("data-outside") === null,
    );

    fireEvent.click(cell.querySelector("button"));

    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
  });
});

describe("the side panel", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByRole("button", { name: en.topBar.openSidePanel }));

  it("is hidden until the top-bar button opens it", async () => {
    await mount();
    expect(screen.queryByText(en.sidePanel.language)).toBeNull();

    openPanel();

    await waitFor(() => expect(screen.getByText(en.sidePanel.language)).not.toBeNull());
  });

  // The functional specs name both dismissals, so both need a test.
  it("closes on a click outside", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.sidePanel.language)).not.toBeNull());

    // Radix defers a left-button dismissal from `pointerdown` to the `click`
    // that follows, so firing `pointerDown` alone would be a test that cannot
    // fail. The whole sequence has to go.
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay);
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);

    await waitFor(() => expect(screen.queryByText(en.sidePanel.language)).toBeNull());
  });

  it("closes on Escape", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.sidePanel.language)).not.toBeNull());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText(en.sidePanel.language)).toBeNull());
  });

  it("switches the language, immediately and with no restart", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.sidePanel.language)).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Français" }));

    expect(setLanguage).toHaveBeenCalledWith("fr");
    // The interface follows where it stands, without being remounted.
    await waitFor(() => expect(screen.getByText(fr.sidePanel.language)).not.toBeNull());
  });

  // A failure is never silent. This one the student cannot act on where they
  // are, so it is a toast rather than an inline message.
  it("toasts when the language cannot be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setLanguage.mockRejectedValue(new Error("database is locked"));
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.sidePanel.language)).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Français" }));

    await waitFor(() => expect(screen.getByText(en.errors.languageFailed)).not.toBeNull());
  });
});

describe("failed reads", () => {
  // `src/db/client.js` caches a rejected `Database.load` on purpose, so every
  // read after a failed migration rejects with the *same* `Error` instance.
  // Reporting on error identity would toast once and then let the view claim
  // "nothing due" for every day the student steps to.
  it("reports every failure, not just the first", async () => {
    const cached = new Error("database unavailable");
    listCourses.mockRejectedValue(cached);
    listHomeworkBetween.mockRejectedValue(cached);

    render(<App />);
    await waitFor(() => expect(screen.getAllByText(en.errors.loadFailed)).toHaveLength(1));
    const before = listHomeworkBetween.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: en.topBar.nextDay }));

    await waitFor(() =>
      expect(listHomeworkBetween.mock.calls.length).toBeGreaterThan(before),
    );
    await waitFor(() => expect(screen.getAllByText(en.errors.loadFailed)).toHaveLength(2));
  });
});

describe("the weekly view", () => {
  it("shows seven day blocks, Monday to Sunday", async () => {
    await mount();

    goWeekly();

    const blocks = screen.getAllByTestId("day-block");
    expect(blocks).toHaveLength(7);
    const headings = blocks.map((block) => block.querySelector("h2").textContent);
    expect(headings[0].startsWith("Monday")).toBe(true);
    expect(headings[4].startsWith("Friday")).toBe(true);
    expect(headings[6].startsWith("Sunday")).toBe(true);
  });

  // Friday sits alone in the left column with the right-hand cell left empty,
  // so that the weekend stays paired on the row below.
  it("leaves the cell beside Friday empty", async () => {
    await mount();
    goWeekly();

    const grid = screen.getAllByTestId("day-block")[0].parentElement;
    const cells = [...grid.children];

    expect(cells).toHaveLength(8);
    expect(cells[5].getAttribute("data-testid")).toBeNull();
    expect(cells[5].getAttribute("aria-hidden")).toBe("true");
    expect(cells[5].textContent).toBe("");
    // The weekend is the pair after the empty cell.
    expect(cells[6].querySelector("h2").textContent.startsWith("Saturday")).toBe(true);
    expect(cells[7].querySelector("h2").textContent.startsWith("Sunday")).toBe(true);
  });

  it("shows the muted empty line in every empty day, never nothing", async () => {
    await mount();
    goWeekly();

    expect(screen.getAllByText(en.homework.empty)).toHaveLength(7);
  });

  // The range has to end on the Sunday: an off-by-one at the far end reads as a
  // plausible label and would otherwise go unnoticed.
  it("labels the week from its Monday to its Sunday", async () => {
    await mount();
    goWeekly();
    await waitFor(() => expect(lastRange()[0]).not.toBe(lastRange()[1]));

    const [monday, sunday] = lastRange();
    expect(dateButton().textContent).toBe(formatWeekRange(monday, sunday, "en"));
  });

  // A day block grows with its content; the page scrolls, a block never does.
  it("never gives a day block a scrollbar of its own", async () => {
    await mount();
    goWeekly();

    for (const block of screen.getAllByTestId("day-block")) {
      expect(block.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    }
  });
});

describe("the daily view", () => {
  // `selectedDate` moves before the data does: the context keeps the previous
  // homework while the next read is in flight, and keeps it for good when that
  // read fails. Only the selected day may ever reach the screen.
  it("renders only the homework due on the selected day", async () => {
    listCourses.mockResolvedValue([{ id: 1, name: "Maths", archived_at: null }]);
    listHomeworkBetween.mockImplementation(async (from) => [
      { id: 1, course_id: 1, due_date: from, title: "today" },
      { id: 2, course_id: 1, due_date: "1999-01-01", title: "another day" },
    ]);

    await mount();

    await waitFor(() => expect(screen.getAllByTestId("homework-item")).toHaveLength(1));
  });

  it("shows the muted empty line when nothing is due that day", async () => {
    listCourses.mockResolvedValue([{ id: 1, name: "Maths", archived_at: null }]);
    listHomeworkBetween.mockResolvedValue([
      { id: 2, course_id: 1, due_date: "1999-01-01", title: "another day" },
    ]);

    await mount();

    await waitFor(() => expect(screen.getByText(en.homework.empty)).not.toBeNull());
    expect(screen.queryByTestId("homework-item")).toBeNull();
  });
});

describe("the course editor in the panel", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByRole("button", { name: en.topBar.openSidePanel }));

  it("is reachable from the side panel", async () => {
    await mount();

    openPanel();

    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());
    expect(screen.getByText("Maths")).not.toBeNull();
  });

  // Escape belongs to the open field. The sheet underneath must not also take
  // it and close the whole panel from under the student.
  it("keeps the panel open when Escape cancels a rename", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: en.courses.rename.replace("{{name}}", "Maths") }),
    );
    const field = await screen.findByDisplayValue("Maths");

    fireEvent.keyDown(field, { key: "Escape" });

    await waitFor(() => expect(screen.queryByDisplayValue("Maths")).toBeNull());
    expect(screen.getByText(en.courses.title)).not.toBeNull();
  });

  // The trap: nothing blurs the add field after it handles Escape, so claiming
  // Escape for any focused input left the panel un-closeable by keyboard for
  // the rest of the session once that field had been touched.
  it("still closes the panel on Escape from the empty add field", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());
    const field = screen.getByLabelText(en.courses.namePlaceholder);
    field.focus();

    fireEvent.keyDown(field, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText(en.courses.title)).toBeNull());
  });

  // Once something has been typed there IS something to cancel, so that Escape
  // clears the draft and the panel stays put.
  it("keeps the panel open when Escape clears a typed draft", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());
    const field = screen.getByLabelText(en.courses.namePlaceholder);
    fireEvent.change(field, { target: { value: "Histoire" } });

    fireEvent.keyDown(field, { key: "Escape" });

    await waitFor(() => expect(field.value).toBe(""));
    expect(screen.getByText(en.courses.title)).not.toBeNull();
  });

  // And Escape with no field open still closes the panel, as it always did.
  it("still closes the panel on Escape outside a field", async () => {
    await mount();
    openPanel();
    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText(en.courses.title)).toBeNull());
  });
});

describe("the first run", () => {
  // A course is mandatory, so homework cannot exist until one does.
  it("explains that a course is needed, in place of the day", async () => {
    listCourses.mockResolvedValue([]);

    await mount();

    expect(await screen.findByText(en.courses.noneTitle)).not.toBeNull();
    expect(screen.queryByText(en.homework.empty)).toBeNull();
  });

  it("replaces the weekly view too", async () => {
    listCourses.mockResolvedValue([]);
    await mount();
    await screen.findByText(en.courses.noneTitle);

    goWeekly();

    expect(screen.queryAllByTestId("day-block")).toHaveLength(0);
    expect(screen.getByText(en.courses.noneTitle)).not.toBeNull();
  });

  it("opens the side panel on the course editor", async () => {
    listCourses.mockResolvedValue([]);
    await mount();

    fireEvent.click(await screen.findByRole("button", { name: en.courses.noneAction }));

    await waitFor(() => expect(screen.getByText(en.courses.title)).not.toBeNull());
  });

  // `loaded` is what holds it back until the first read settles. Without that,
  // the very first frame claims there are no courses on a database that may
  // well have some — the flash of a wrong screen, and a lie while it lasts.
  it("stays away while the first read is still in flight", async () => {
    listCourses.mockReturnValue(new Promise(() => {}));
    listHomeworkBetween.mockReturnValue(new Promise(() => {}));

    render(<App />);

    await waitFor(() => expect(listHomeworkBetween).toHaveBeenCalled());
    expect(screen.queryByText(en.courses.noneTitle)).toBeNull();
  });

  // `courses` carries archived rows too — that is what keeps a homework entry's
  // course name alive. Counting them here would strand a student who deleted
  // their only course in a view with no way back to the button that makes one.
  it("comes back when the last active course is archived", async () => {
    listCourses.mockResolvedValue([
      { id: 1, name: "Maths", archived_at: "2026-08-25T10:00:00Z" },
    ]);

    await mount();

    expect(await screen.findByText(en.courses.noneTitle)).not.toBeNull();
  });

  // A database that could not be read is not a student with no courses, and
  // telling them to create one would be a lie.
  it("stays away when the read failed", async () => {
    listCourses.mockRejectedValue(new Error("database unavailable"));
    listHomeworkBetween.mockRejectedValue(new Error("database unavailable"));

    render(<App />);

    await waitFor(() => expect(screen.getByText(en.errors.loadFailed)).not.toBeNull());
    expect(screen.queryByText(en.courses.noneTitle)).toBeNull();
  });
});

describe("a failing homework write in the weekly view", () => {
  // `App.test.jsx` covers this same chain (App → MainView → DailyView →
  // CourseGroup) for the daily view, which is where a new mount always starts.
  // WeeklyView → DayBlock → CourseGroup is a second, structurally identical
  // chain that a daily-only test cannot reach — a dropped `onError` prop on
  // this path was previously invisible to the suite.
  it("toasts through the weekly-view chain rather than failing silently", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listHomeworkBetween.mockResolvedValue([
      {
        id: 1,
        text: "Exercice 4 page 12",
        due_date: "2026-08-25",
        course_id: 1,
        done: 0,
        created_at: "2026-08-20T08:00:00Z",
      },
    ]);
    setHomeworkDone.mockRejectedValue(new Error("database is locked"));

    await mount();
    goWeekly();
    const checkbox = await screen.findByRole("checkbox");

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(en.errors.saveFailed)).not.toBeNull();
    });
  });
});
