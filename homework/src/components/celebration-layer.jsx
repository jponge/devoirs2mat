// Mounted once per day card — `src/components/daily-view.jsx`'s single
// section and each `DayBlock` in `src/components/weekly-view.jsx` — rather
// than once globally. It owns no context, drives itself entirely from
// `src/lib/celebration.js`'s pub-sub, and never blocks or represents a
// write: the trigger it listens for (`emitDayCompleted`, called from
// `course-group.jsx`) already ran after the real database write succeeded.
//
// Position is plain CSS: the sprite is `position: absolute` against its own
// card (which must itself be `position: relative`), centered on it via
// `top: 50%; left: 50%; transform: translate(-50%, -50%)`. No
// `getBoundingClientRect`, pointer tracking, or clamp math —
// that approach anchored one shared overlay to whichever card or point last
// triggered it, which put the sprite far from the card that actually
// completed once that card wasn't the one nearest the anchor (the nav bar,
// briefly; before that, wherever the pointer happened to be). Mounting one
// instance per card and filtering by `date` means each card only ever shows
// its own sprite, already positioned relative to itself.
import { useEffect, useRef, useState } from "react";
import { onDayCompleted } from "@/lib/celebration";
import { KangarooSprite, GESTURES } from "@/components/kangaroo-sprite";

const TOTAL_LIFETIME_MS = 1600;
const LEAVE_DURATION_MS = 300;

// Doubled from the original 88px starting point per feedback — the accents
// (sparkles/burst/trail) live in the same SVG viewBox as the silhouette, so
// this one constant scales the whole sprite, gestures and all, together.
const SPRITE_SIZE_PX = 176;

export function CelebrationLayer({ date }) {
  const [entries, setEntries] = useState([]);
  // A plain cycling index, not `Math.random`: "never the same gesture twice
  // in a row" is a guarantee this gives directly, which randomness cannot
  // without extra bookkeeping to reject repeats.
  const gestureCursor = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    const unsubscribe = onDayCompleted((completedDate) => {
      // Every card's instance hears every completion; only the one whose own
      // day just completed reacts.
      if (completedDate !== date) {
        return;
      }
      const gesture = GESTURES[gestureCursor.current % GESTURES.length];
      gestureCursor.current += 1;
      const id = nextId.current;
      nextId.current += 1;

      // An array, not a single slot: rapidly checking and unchecking the
      // last item on the same day can complete it more than once in close
      // succession, and each completion gets its own independent sprite and
      // lifetime rather than the newest one replacing another.
      setEntries((current) => [...current, { id, gesture }]);

      setTimeout(() => {
        setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
      }, TOTAL_LIFETIME_MS - LEAVE_DURATION_MS);

      setTimeout(() => {
        setEntries((current) => current.filter((entry) => entry.id !== id));
      }, TOTAL_LIFETIME_MS);
    });
    return unsubscribe;
  }, [date]);

  return (
    <>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: SPRITE_SIZE_PX,
            height: SPRITE_SIZE_PX,
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <KangarooSprite gesture={entry.gesture} playing={!entry.leaving} leaving={Boolean(entry.leaving)} />
        </div>
      ))}
    </>
  );
}
