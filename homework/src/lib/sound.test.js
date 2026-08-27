import { describe, it, expect, vi } from "vitest";
import { playCheckSound, playUncheckSound } from "@/lib/sound";

// A minimal fake AudioContext: just enough surface for sound.js to call,
// with spies so a test can assert what it did without a real audio device —
// the same reason startSystemThemeSync takes an injectable `win` instead of
// reaching for a jsdom global that does not exist.
function fakeAudioContext() {
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => gain),
  };
  const oscillator = {
    type: null,
    frequency: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => oscillator),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const ctx = {
    currentTime: 0,
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => oscillator),
    destination: {},
  };
  return { ctx, gain, oscillator };
}

function fakeWin(ctx) {
  // `AudioContext` is used with `new`, and a `vi.fn()` wrapping an arrow
  // function cannot act as a constructor — it silently returns a plain
  // empty object instead of `ctx`. A `function` expression is required.
  return {
    AudioContext: vi.fn(function () {
      return ctx;
    }),
  };
}

describe("playCheckSound", () => {
  it("ramps the oscillator frequency upward", () => {
    const { ctx, oscillator } = fakeAudioContext();
    playCheckSound(fakeWin(ctx));
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 0);
    expect(oscillator.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
    expect(oscillator.type).toBe("triangle");
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
  });
});

describe("playUncheckSound", () => {
  it("ramps the oscillator frequency downward", () => {
    const { ctx, oscillator } = fakeAudioContext();
    playUncheckSound(fakeWin(ctx));
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(520, 0);
    expect(oscillator.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(400, expect.any(Number));
  });
});

describe("when no AudioContext is available", () => {
  it("does not throw", () => {
    expect(() => playCheckSound({})).not.toThrow();
    expect(() => playUncheckSound({})).not.toThrow();
  });
});

describe("when the AudioContext constructor itself throws", () => {
  it("does not throw", () => {
    const win = {
      AudioContext: vi.fn(function () {
        throw new Error("blocked");
      }),
    };
    expect(() => playCheckSound(win)).not.toThrow();
  });
});
