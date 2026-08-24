import "@/index.css";
import { boot } from "@/boot";
import { resolveStartup } from "@/startup";

// Nothing about startup may end with a blank window, so `resolveStartup` always
// settles: with the resolved language, or with the detected one once its
// deadline passes. A failure that only arrives afterwards still has to reach the
// user, which is what `onLate` is for — milestone 6 turns both into a toast.
resolveStartup({
  onLate: ({ error }) => {
    if (error !== undefined && error !== null) {
      console.error("the database answered late, with an error", error);
    }
  },
}).then(({ error }) => {
  boot(document.getElementById("root"), error);
});
