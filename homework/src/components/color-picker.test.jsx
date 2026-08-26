import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ColorPicker } from "@/components/color-picker";
import { COURSE_COLORS } from "@/lib/course-colors";
import i18n from "@/i18n";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";

const RED = COURSE_COLORS.find((color) => color.key === "red").hex;
const BLUE = COURSE_COLORS.find((color) => color.key === "blue").hex;

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

function mount(props = {}) {
  const onChange = vi.fn();
  const view = render(
    <ColorPicker value={RED} onChange={onChange} triggerLabel="Choose a color" {...props} />,
  );
  return { onChange, ...view };
}

const openPopover = () => fireEvent.click(screen.getByRole("button", { name: "Choose a color" }));

describe("the trigger", () => {
  it("shows the current color as its own background", () => {
    mount();

    const trigger = screen.getByRole("button", { name: "Choose a color" });
    expect(trigger.style.backgroundColor).toBeTruthy();
  });

  it("carries the label it was given as its accessible name", () => {
    mount({ triggerLabel: "Change the color of Maths" });

    expect(screen.getByRole("button", { name: "Change the color of Maths" })).not.toBeNull();
  });
});

describe("the swatch grid", () => {
  it("offers all 20 curated colors, each with a plain accessible name", async () => {
    mount();
    openPopover();

    for (const color of COURSE_COLORS) {
      expect(await screen.findByRole("button", { name: en.colors[color.key] })).not.toBeNull();
    }
  });

  it("marks the swatch matching the current value as selected", async () => {
    mount({ value: BLUE });
    openPopover();

    const blueSwatch = await screen.findByRole("button", { name: en.colors.blue });
    expect(blueSwatch.getAttribute("aria-pressed")).toBe("true");
    const redSwatch = screen.getByRole("button", { name: en.colors.red });
    expect(redSwatch.getAttribute("aria-pressed")).toBe("false");
  });

  it("matches the current value case-insensitively", async () => {
    mount({ value: BLUE.toUpperCase() });
    openPopover();

    const blueSwatch = await screen.findByRole("button", { name: en.colors.blue });
    expect(blueSwatch.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks nothing as selected when the value is a custom color outside the palette", async () => {
    mount({ value: "#123abc" });
    openPopover();

    for (const color of COURSE_COLORS) {
      const swatch = await screen.findByRole("button", { name: en.colors[color.key] });
      expect(swatch.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("calls onChange immediately with the swatch's hex when clicked", async () => {
    const { onChange } = mount();
    openPopover();

    fireEvent.click(await screen.findByRole("button", { name: en.colors.blue }));

    expect(onChange).toHaveBeenCalledWith(BLUE);
  });

  it("closes the popover after picking a swatch", async () => {
    mount();
    openPopover();
    fireEvent.click(await screen.findByRole("button", { name: en.colors.blue }));

    await waitFor(() => expect(screen.queryByRole("button", { name: en.colors.blue })).toBeNull());
  });

  // Picking a swatch closes the popover (the same precedent the due-date
  // calendar `Popover` in `course-group.jsx` already sets), so the hex field
  // syncing to the pick is only observable by reopening — which is exactly
  // what proves `value` and the hex field never drift apart.
  it("updates the hex field to match the swatch just picked, once reopened", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorPicker value={RED} onChange={onChange} triggerLabel="Choose a color" />,
    );
    openPopover();
    fireEvent.click(await screen.findByRole("button", { name: en.colors.blue }));

    rerender(<ColorPicker value={BLUE} onChange={onChange} triggerLabel="Choose a color" />);
    openPopover();

    expect(await screen.findByDisplayValue(BLUE)).not.toBeNull();
  });
});

describe("the hex field", () => {
  it("shows the current value", async () => {
    mount({ value: BLUE });
    openPopover();

    expect(await screen.findByDisplayValue(BLUE)).not.toBeNull();
  });

  it("has a placeholder and accessible name from the catalog", async () => {
    mount();
    openPopover();

    expect(await screen.findByLabelText(en.courses.colorHexPlaceholder)).not.toBeNull();
  });

  it("calls onChange with the normalized value once a well-formed hex is typed", async () => {
    const { onChange } = mount();
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);

    fireEvent.change(field, { target: { value: "#3B82F6" } });

    expect(onChange).toHaveBeenCalledWith("#3b82f6");
  });

  // A write this same field triggered completes asynchronously (`onChange`,
  // then a `reload()` elsewhere brings the new `value` back down as a prop).
  // If that arrival resynced the field unconditionally, it would silently
  // overwrite whatever the student had typed in the meantime.
  it("does not let an external value update stomp an in-progress edit while the popover stays open", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorPicker value={RED} onChange={onChange} triggerLabel="Choose a color" />,
    );
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);
    fireEvent.change(field, { target: { value: "#3b82f6" } });
    expect(onChange).toHaveBeenCalledWith("#3b82f6");

    fireEvent.change(field, { target: { value: "#3b82f" } });
    rerender(<ColorPicker value="#3b82f6" onChange={onChange} triggerLabel="Choose a color" />);

    expect(field.value).toBe("#3b82f");
  });

  it("does not call onChange while the value is not yet well-formed", async () => {
    const { onChange } = mount();
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);

    fireEvent.change(field, { target: { value: "#3b" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an inline error while the typed value is malformed", async () => {
    mount();
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);

    fireEvent.change(field, { target: { value: "#3b" } });

    expect((await screen.findByRole("alert")).textContent).toBe(en.courses.colorInvalid);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the error once the value becomes well-formed again", async () => {
    mount();
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);
    fireEvent.change(field, { target: { value: "#3b" } });
    await screen.findByRole("alert");

    fireEvent.change(field, { target: { value: "#3b82f6" } });

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does not close the popover while typing", async () => {
    mount();
    openPopover();
    const field = await screen.findByLabelText(en.courses.colorHexPlaceholder);

    fireEvent.change(field, { target: { value: "#3b82f6" } });

    expect(screen.getByRole("button", { name: en.colors.blue })).not.toBeNull();
  });
});

describe("in French", () => {
  it("translates swatch names and the hex field", async () => {
    mount();
    await i18n.changeLanguage("fr");
    openPopover();

    expect(await screen.findByRole("button", { name: fr.colors.blue })).not.toBeNull();
    expect(screen.getByLabelText(fr.courses.colorHexPlaceholder)).not.toBeNull();
  });
});
