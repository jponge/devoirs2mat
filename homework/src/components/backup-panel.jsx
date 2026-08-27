// Export and import, as `specs/functional-specs.md` describes the side panel
// offering: a full-database backup and a full, irreversible restore.
//
// Import validates the file **before** the confirmation dialog is ever
// shown: `validateExport` runs first, so a bad file (wrong header or a
// mismatched schema version) is refused immediately rather than presenting a
// confirmation for something that would fail anyway. Only a structurally
// valid, version-matched file reaches the `AlertDialog`.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppData } from "@/components/app-data";
import { exportDatabase, importDatabase } from "@/db/backup";
import { validateExport } from "@/lib/sql-export";
import { startLanguage } from "@/i18n/preference";
import { todayDate } from "@/lib/dates";

const SQL_FILTER = [{ name: "SQL", extensions: ["sql"] }];

// `onError(failure, kind)` — `kind` is one of `"exportFailed"`,
// `"importRefused"` or `"importFailed"`, each the exact suffix of its own
// `backup.*` catalog key, so the caller can map it to copy with no lookup
// table of its own (mirrors `reportHomeworkFailure`'s `"save"` / `"link"`).
export function BackupPanel({ onError = () => {}, onExportSuccess = () => {} }) {
  const { t } = useTranslation();
  const { reload } = useAppData();
  const [pendingImport, setPendingImport] = useState(null);

  const doExport = async () => {
    try {
      const path = await save({
        defaultPath: `devoirs-${todayDate()}.sql`,
        filters: SQL_FILTER,
      });
      // A `null` path means the dialog was cancelled — a silent no-op, the
      // same as any other OS file dialog.
      if (path === null) {
        return;
      }
      const text = await exportDatabase();
      await writeTextFile(path, text);
      // Unlike every other write in this application, a successful export
      // leaves no visible trace anywhere in the interface — the checkbox
      // toggle shows a struck-through card, a rename shows the new name, but
      // the file just lands on disk. This is the one write whose success
      // needs a toast rather than relying on the UI already showing it.
      onExportSuccess();
    } catch (failure) {
      onError(failure, "exportFailed");
    }
  };

  const chooseImport = async () => {
    try {
      const path = await open({ filters: SQL_FILTER });
      if (path === null) {
        return;
      }
      const text = await readTextFile(path);
      validateExport(text);
      setPendingImport(text);
    } catch (failure) {
      onError(failure, "importRefused");
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
  };

  const confirmImport = async () => {
    const text = pendingImport;
    setPendingImport(null);
    try {
      await importDatabase(text);
      // A restore replaces `settings` too, so `settings.language` can change
      // under the running application — re-resolve it exactly the way
      // startup does, rather than leaving the interface in a language the
      // restored database no longer says the student chose.
      await startLanguage();
      await reload();
    } catch (failure) {
      onError(failure, "importFailed");
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4">
      <h3 className="text-sm font-medium">{t("backup.title")}</h3>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={doExport}>
          {t("backup.export")}
        </Button>
        <Button variant="outline" size="sm" onClick={chooseImport}>
          {t("backup.import")}
        </Button>
      </div>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            cancelImport();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("backup.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("backup.confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("backup.confirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>
              {t("backup.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
