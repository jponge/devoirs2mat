// The side panel, as `specs/functional-specs.md` describes it: hidden by
// default, opened from a button in the top bar, dismissed with `Escape` or a
// click outside. It is a `sheet` rather than a permanent sidebar so the main
// view always keeps the full window width.
//
// Escape and outside-click dismissal come from the Radix dialog underneath and
// are deliberately not re-implemented here.
//
// It carries the language switch, the course editor, and the export/import
// section, each separated by a divider.
import { useTranslation } from "react-i18next";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CourseEditor } from "@/components/course-editor";
import { BackupPanel } from "@/components/backup-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SUPPORTED_LANGUAGES } from "@/i18n/language";
import { setLanguage } from "@/i18n/preference";

// `open` / `onOpenChange` are controlled by the caller rather than left to the
// sheet's own state: the first-run empty state in the main view opens this panel
// from outside it.
//
// Callbacks rather than a toast raised here: a write that failed is reported
// by whoever owns the toaster, and keeping this component free of that
// decision is what lets it be tested without one. Two separate callbacks,
// not one shared `onError`, because the language switch and the course
// editor warrant different messages — a shared one previously meant a failed
// course write showed "Couldn't save the language.", which was never caught
// because no test exercised a course-write failure through the full app.
export function SidePanel({
  onLanguageError = () => {},
  onCourseError = () => {},
  onBackupError = () => {},
  open,
  onOpenChange,
}) {
  const { t, i18n } = useTranslation();

  const choose = async (language) => {
    try {
      // `setLanguage` already writes before it applies, and already refuses an
      // unsupported value. Neither check is repeated here.
      await setLanguage(language);
    } catch (failure) {
      onLanguageError(failure);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("topBar.openSidePanel")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-80"
        // Radix listens for Escape in the CAPTURE phase on the document, so a
        // field cannot stop it by stopping propagation — by the time the field
        // sees the event the sheet has already decided to close. This is the
        // sanctioned way to say otherwise.
        //
        // The marker, rather than "any focused input": a field only claims
        // Escape when it has something to cancel, and says so itself. Claiming
        // it for every input made the panel un-closeable by keyboard the moment
        // the empty add field took focus, which nothing ever blurs.
        onEscapeKeyDown={(event) => {
          if (event.target?.dataset?.cancelsEscape === "true") {
            event.preventDefault();
          }
        }}
      >
        {/* The sheet's own title and description, kept for screen readers —
            Radix expects a `Dialog.Title`/`Description` pair for the panel to
            announce itself correctly — but not shown: the three section
            headings below already say what this panel is for, and repeating
            it above them was redundant. */}
        <SheetHeader>
          <SheetTitle className="sr-only">{t("sidePanel.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("sidePanel.description")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          <h3 className="text-sm font-medium">{t("sidePanel.language")}</h3>
          <div className="flex gap-2">
            {SUPPORTED_LANGUAGES.map((language) => (
              <Button
                key={language}
                variant={i18n.language === language ? "default" : "outline"}
                size="sm"
                aria-pressed={i18n.language === language}
                onClick={() => choose(language)}
              >
                {/* Endonyms: a language is named in its own language in both
                    catalogs, so the option a French speaker is looking for
                    still reads "Français" while the interface is in English. */}
                {t(`language.${language}`)}
              </Button>
            ))}
          </div>
        </div>

        <Separator className="my-4" />

        <CourseEditor onError={onCourseError} />

        <Separator className="my-4" />

        <BackupPanel onError={onBackupError} />
      </SheetContent>
    </Sheet>
  );
}
