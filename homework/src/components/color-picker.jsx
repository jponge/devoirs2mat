// A controlled, presentational course-color picker: a small swatch trigger
// that opens a `Popover` holding the curated swatch grid plus a hex `Input`.
// No `useAppData()`, no `src/db/` import — same rule `HomeworkEditForm` in
// `course-group.jsx` already follows.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COURSE_COLORS, normalizeCourseColor, validateCourseColor } from "@/lib/course-colors";

export function ColorPicker({ value, onChange, triggerLabel }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const [hexProblem, setHexProblem] = useState(null);

  // Resyncs the hex field from `value` only at the moment the popover opens,
  // deliberately not on every `value` change while it stays open. A write
  // this picker itself triggered completes asynchronously (`onChange` then a
  // `reload()` elsewhere); resyncing on every `value` change would let that
  // completion silently overwrite a keystroke typed in the meantime. `value`
  // is intentionally left out of the dependency list — the effect always
  // reads whatever `value` is current at the render where `open` flips to
  // `true`, which is exactly the moment a fresh sync is wanted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setHexDraft(value);
      setHexProblem(null);
    }
  }, [open]);

  const pickSwatch = (hex) => {
    onChange(hex);
    setOpen(false);
  };

  const onHexChange = (event) => {
    const typed = event.target.value;
    setHexDraft(typed);
    const problem = validateCourseColor(typed);
    setHexProblem(problem);
    if (problem === null) {
      onChange(normalizeCourseColor(typed));
    }
  };

  const normalizedValue = normalizeCourseColor(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className="size-6 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <div className="grid grid-cols-5 gap-2" role="group" aria-label={triggerLabel}>
          {COURSE_COLORS.map((color) => (
            <button
              key={color.key}
              type="button"
              aria-label={t(`colors.${color.key}`)}
              aria-pressed={normalizedValue === color.hex}
              className={cn(
                "size-6 rounded-full border-2",
                normalizedValue === color.hex ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: color.hex }}
              onClick={() => pickSwatch(color.hex)}
            />
          ))}
        </div>
        <Input
          value={hexDraft}
          onChange={onHexChange}
          placeholder={t("courses.colorHexPlaceholder")}
          aria-label={t("courses.colorHexPlaceholder")}
          aria-invalid={hexProblem !== null}
          aria-describedby={hexProblem === null ? undefined : "color-picker-problem"}
        />
        {hexProblem !== null ? (
          <p id="color-picker-problem" role="alert" className="text-sm text-destructive">
            {t("courses.colorInvalid")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
