// Two short, synthesized tones for the homework checkbox — no bundled audio
// files, no new dependency. `win` is injectable the same way
// `startSystemThemeSync` takes one, which is what lets a test supply a fake
// AudioContext instead of reaching for a jsdom global that does not exist.
//
// Neither function ever throws: this is a decorative cue, not a write the
// student needs to know failed, and an unavailable or blocked AudioContext
// must never stop the checkbox toggle it is called from.

// Keyed by `win` rather than a single module-level variable: in the running
// application `win` is always the same `window`, so this still reuses one
// real AudioContext across every call, but a test passing a fresh fake `win`
// per case gets its own context instead of silently reusing another test's.
const contexts = new WeakMap();

function getContext(win) {
  if (contexts.has(win)) {
    return contexts.get(win);
  }
  const Ctor = win.AudioContext || win.webkitAudioContext;
  if (typeof Ctor !== "function") {
    return null;
  }
  const ctx = new Ctor();
  contexts.set(win, ctx);
  return ctx;
}

function playTone(win, startFrequency, endFrequency) {
  try {
    const ctx = getContext(win);
    if (ctx === null) {
      return;
    }
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.linearRampToValueAtTime(endFrequency, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  } catch {
    // Decorative only — an unavailable or blocked AudioContext must never
    // surface as a failure to the student.
  }
}

export function playCheckSound(win = window) {
  playTone(win, 660, 880);
}

export function playUncheckSound(win = window) {
  playTone(win, 520, 400);
}
