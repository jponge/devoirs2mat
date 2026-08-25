// The side panel, as `specs/functional-specs.md` describes it: hidden by
// default, opened from a button in the top bar, dismissed with `Escape` or a
// click outside. It is a `sheet` rather than a permanent sidebar so the main
// view always keeps the full window width.
//
// Escape and outside-click dismissal come from the Radix dialog underneath and
// are deliberately not re-implemented here.
//
// In this milestone it carries the language switch only. The course editor
// lands in milestone 7, below the separator.
import { useTranslation } from "react-i18next";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

// `onError` rather than a toast raised here: a write that failed is reported by
// whoever owns the toaster, and keeping this component free of that decision is
// what lets it be tested without one.
export function SidePanel({ onError = () => {} }) {
  const { t, i18n } = useTranslation();

  const choose = async (language) => {
    try {
      // `setLanguage` already writes before it applies, and already refuses an
      // unsupported value. Neither check is repeated here.
      await setLanguage(language);
    } catch (failure) {
      onError(failure);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("topBar.openSidePanel")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>{t("sidePanel.title")}</SheetTitle>
          <SheetDescription>{t("sidePanel.description")}</SheetDescription>
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

        {/* Milestone 7 puts the course editor here. */}
        <Separator className="my-2" />
      </SheetContent>
    </Sheet>
  );
}
