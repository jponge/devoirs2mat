import { describe, it, expect, vi } from "vitest";
import { emitDayCompleted, onDayCompleted } from "@/lib/celebration";

describe("celebration pub-sub", () => {
  it("notifies a subscriber with the emitted date", () => {
    const seen = [];
    onDayCompleted((date) => seen.push(date));
    emitDayCompleted("2026-03-02");
    expect(seen).toEqual(["2026-03-02"]);
  });

  it("notifies every current subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    onDayCompleted(a);
    onDayCompleted(b);
    emitDayCompleted("2026-03-02");
    expect(a).toHaveBeenCalledWith("2026-03-02");
    expect(b).toHaveBeenCalledWith("2026-03-02");
  });

  it("stops notifying once unsubscribed", () => {
    const callback = vi.fn();
    const unsubscribe = onDayCompleted(callback);
    unsubscribe();
    emitDayCompleted("2026-03-02");
    expect(callback).not.toHaveBeenCalled();
  });

  it("unsubscribing one subscriber does not affect another", () => {
    const stays = vi.fn();
    const leaves = vi.fn();
    onDayCompleted(stays);
    const unsubscribe = onDayCompleted(leaves);
    unsubscribe();
    emitDayCompleted("2026-03-02");
    expect(stays).toHaveBeenCalledWith("2026-03-02");
    expect(leaves).not.toHaveBeenCalled();
  });

  it("emitting with no subscribers does nothing", () => {
    expect(() => emitDayCompleted("2026-03-02")).not.toThrow();
  });
});
