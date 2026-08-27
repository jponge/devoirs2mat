import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { CelebrationLayer } from "@/components/celebration-layer";
import { emitDayCompleted } from "@/lib/celebration";

describe("CelebrationLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a sprite when its own day completes", () => {
    const { container } = render(<CelebrationLayer date="2026-03-02" />);

    act(() => {
      emitDayCompleted("2026-03-02");
    });

    expect(container.querySelectorAll("svg.roo")).toHaveLength(1);
  });

  it("ignores a completion for a different day", () => {
    const { container } = render(<CelebrationLayer date="2026-03-02" />);

    act(() => {
      emitDayCompleted("2026-03-03");
    });

    expect(container.querySelectorAll("svg.roo")).toHaveLength(0);
  });

  it("removes the sprite once its lifetime has elapsed", () => {
    const { container } = render(<CelebrationLayer date="2026-03-02" />);

    act(() => {
      emitDayCompleted("2026-03-02");
    });
    expect(container.querySelectorAll("svg.roo")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelectorAll("svg.roo")).toHaveLength(0);
  });

  it("shows two independent sprites when the same day completes twice in close succession", () => {
    const { container } = render(<CelebrationLayer date="2026-03-02" />);

    act(() => {
      emitDayCompleted("2026-03-02");
      emitDayCompleted("2026-03-02");
    });

    expect(container.querySelectorAll("svg.roo")).toHaveLength(2);
  });

  it("cycles gestures round-robin, never repeating the previous one", () => {
    const { container } = render(<CelebrationLayer date="2026-03-02" />);
    const seen = [];

    for (let i = 0; i < 4; i += 1) {
      act(() => {
        emitDayCompleted("2026-03-02");
      });
      const svg = container.querySelector("svg.roo");
      seen.push([...svg.classList].find((name) => name.startsWith("gesture-")));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    }

    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });
});
