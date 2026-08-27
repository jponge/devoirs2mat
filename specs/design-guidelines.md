# Design guidelines

- Respect the shadcn components design, the `b7W7uXIq8` preset defines the expected look and feel
- Use subtle animations to make the interface lively, for instance when components appear or disappear
- Do not try to change the default sizes in components: fonts, icons, etc
- **The homework-completion celebration (a brief kangaroo animation, plus the checkbox sounds) is a deliberate,
  bounded exception, not a reopening of the "no mascot voice" rule below.** It is wordless motion and sound, never
  copy — no speech bubble, no personality, no text of its own. Do not use it as license to add jokes, exclamation
  marks or a mascot voice anywhere else in the interface
    - It uses three fixed colors outside the shadcn preset: `--celebration-warm`, `--celebration-green` and
      `--celebration-blue` (`src/index.css`), one per gesture. These are not named `--accent` or `--primary`
      because the preset already defines those tokens with unrelated values
    - The sprite's silhouette is a third-party asset (`Kangourou.svg` by Lionel Allorge, Wikimedia Commons,
      CC BY-SA 3.0), used as-is with only its fill color changed. The license's attribution requirement is met by
      a credit in the side panel's About section (`src/components/side-panel.jsx`) — do not remove that credit
- Follow the system appearance: both the light and the dark palettes of the preset are used, and there is no
  in-application theme switch
- An empty area shows a short muted line rather than nothing at all, so that it reads as deliberate
- **The interface speaks to a 6–18 year old student, not to an administrator.** Write plainly and warmly, without
  being goofy: no jokes, no exclamation marks, no mascot voice. Prefer the active voice and a short sentence —
  "Couldn’t load your homework." over "Homework could not be loaded." Address the student directly.
    - **French uses `tu`, never `vous`.** A child is not a customer. This applies to every string, including error
      messages
    - Say what happened and what to do about it, in that order, and never blame the student for a failure that was
      not theirs
    - Use the typographic apostrophe `’` in both languages, never the straight `'`
