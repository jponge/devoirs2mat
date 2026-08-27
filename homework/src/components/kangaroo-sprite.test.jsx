import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KangarooSprite, GESTURES } from "@/components/kangaroo-sprite";

describe("KangarooSprite", () => {
  it("is aria-hidden regardless of gesture, since it is purely decorative", () => {
    for (const gesture of GESTURES) {
      const { container, unmount } = render(<KangarooSprite gesture={gesture} />);
      expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
      unmount();
    }
  });

  it("always renders exactly one silhouette path", () => {
    const { container } = render(<KangarooSprite gesture="pop" />);
    expect(container.querySelectorAll(".silhouette")).toHaveLength(1);
  });

  it("renders three burst dots for the pop gesture, and no other accent type", () => {
    const { container } = render(<KangarooSprite gesture="pop" />);
    expect(container.querySelectorAll(".accent-burst")).toHaveLength(3);
    expect(container.querySelectorAll(".accent-sparkle")).toHaveLength(0);
    expect(container.querySelectorAll(".accent-trail")).toHaveLength(0);
  });

  it("renders three sparkles for the nod gesture, and no other accent type", () => {
    const { container } = render(<KangarooSprite gesture="nod" />);
    expect(container.querySelectorAll(".accent-sparkle")).toHaveLength(3);
    expect(container.querySelectorAll(".accent-burst")).toHaveLength(0);
    expect(container.querySelectorAll(".accent-trail")).toHaveLength(0);
  });

  it("renders three trail arcs for the sway gesture, and no other accent type", () => {
    const { container } = render(<KangarooSprite gesture="sway" />);
    expect(container.querySelectorAll(".accent-trail")).toHaveLength(3);
    expect(container.querySelectorAll(".accent-burst")).toHaveLength(0);
    expect(container.querySelectorAll(".accent-sparkle")).toHaveLength(0);
  });

  it("carries the gesture in its class name", () => {
    const { container } = render(<KangarooSprite gesture="sway" />);
    expect(container.querySelector("svg").classList.contains("gesture-sway")).toBe(true);
  });

  it("toggles the playing and leaving classes from props", () => {
    const { container, rerender } = render(<KangarooSprite gesture="pop" playing />);
    const svg = container.querySelector("svg");
    expect(svg.classList.contains("playing")).toBe(true);
    expect(svg.classList.contains("leaving")).toBe(false);

    rerender(<KangarooSprite gesture="pop" leaving />);
    expect(svg.classList.contains("playing")).toBe(false);
    expect(svg.classList.contains("leaving")).toBe(true);
  });
});
