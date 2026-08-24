import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// Imported for its side effect: i18next has to be initialised before any
// component calls `useTranslation`, and depending on the import order of
// whoever renders this component would be a trap.
import "@/i18n";

// `startupError` is the database failure `startLanguage` caught, or `null`. The
// application renders either way — a database that cannot be opened must not
// leave the student in front of a blank window.
function App({ startupError = null }) {
  const { t } = useTranslation();

  // Held, not swallowed. `specs/functional-specs.md` requires a migration error
  // at startup to be reported with a toast, and the toast component arrives with
  // the drawer in milestone 6, which reads this prop. Logging it in the meantime
  // is what keeps the failure findable rather than silent.
  useEffect(() => {
    if (startupError !== null) {
      console.error("The database could not be opened at startup", startupError);
    }
  }, [startupError]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      {/* The application name is never translated. */}
      <h1 className="text-2xl font-semibold tracking-tight">Devoirs2mat</h1>

      <Card className="w-full max-w-md animate-in fade-in duration-500">
        <CardHeader>
          <CardTitle>{t("shell.cardTitle")}</CardTitle>
          <CardDescription>{t("shell.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("shell.cardBody")}</p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button>{t("shell.primaryButton")}</Button>
          <Button variant="secondary">{t("shell.secondaryButton")}</Button>
          <Button variant="outline">{t("shell.outlineButton")}</Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default App;
