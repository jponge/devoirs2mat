import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveStartup, STARTUP_DEADLINE_MS } from "@/startup";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveStartup", () => {
  it("uses the resolved language when the database answers in time", async () => {
    const start = vi.fn().mockResolvedValue({ language: "fr", error: null });

    const result = await resolveStartup({ start });

    expect(result).toEqual({ language: "fr", error: null, timedOut: false });
  });

  it("passes through an error the read reported without rejecting", async () => {
    const failure = new Error("the database did not open");
    const start = vi.fn().mockResolvedValue({ language: "en", error: failure });

    const result = await resolveStartup({ start });

    expect(result.error).toBe(failure);
    expect(result.timedOut).toBe(false);
  });

  it("settles with the detected language when the read never answers", async () => {
    vi.useFakeTimers();
    // A read that never settles is the case that would otherwise leave the user
    // looking at an empty window.
    const start = vi.fn(() => new Promise(() => {}));

    const pending = resolveStartup({ start, deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual({
      language: "en",
      error: null,
      timedOut: true,
    });
  });

  // The point of the whole design: slow is not broken. Reporting a failure here
  // would tell a student their data is gone because a migration took a moment.
  it("reports a timeout as a timeout, not as an error", async () => {
    vi.useFakeTimers();
    const start = vi.fn(() => new Promise(() => {}));

    const pending = resolveStartup({ start, deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;

    expect(result.timedOut).toBe(true);
    expect(result.error).toBeNull();
  });

  it("delivers a late failure through onLate instead of losing it", async () => {
    vi.useFakeTimers();
    const failure = new Error("the database did not open");
    let settle;
    const start = vi.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const onLate = vi.fn();

    const pending = resolveStartup({ start, deadlineMs: 50, onLate });
    await vi.advanceTimersByTimeAsync(50);
    await pending;

    expect(onLate).not.toHaveBeenCalled();

    settle({ language: "fr", error: failure });
    await vi.advanceTimersByTimeAsync(0);

    expect(onLate).toHaveBeenCalledWith({ language: "fr", error: failure });
  });

  it("does not call onLate when the read wins the race", async () => {
    const onLate = vi.fn();
    const start = vi.fn().mockResolvedValue({ language: "fr", error: null });

    await resolveStartup({ start, onLate });

    expect(onLate).not.toHaveBeenCalled();
  });

  it("treats a rejected read as a failure rather than crashing startup", async () => {
    const failure = new Error("boom");
    const start = vi.fn().mockRejectedValue(failure);

    const result = await resolveStartup({ start });

    expect(result.error).toBe(failure);
    expect(result.language).toBe("en");
  });

  it("has a deadline short enough not to be a wait in itself", () => {
    expect(STARTUP_DEADLINE_MS).toBeLessThanOrEqual(3000);
  });
});
