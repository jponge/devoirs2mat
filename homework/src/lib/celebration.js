// A minimal pub-sub for "a day just went to zero-left". This is what lets
// `CourseGroup`'s `toggle()` — which only knows about one course's own
// cards — announce a day-level event without a reference to whatever
// renders the celebration, and without threading a callback prop through
// every day block down to every `CourseGroup` instance under it.
const subscribers = new Set();

export function emitDayCompleted(date) {
  for (const callback of subscribers) {
    callback(date);
  }
}

// Returns an unsubscribe function, the same shape i18next's own
// `languageChanged` subscription uses elsewhere in this codebase.
export function onDayCompleted(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
