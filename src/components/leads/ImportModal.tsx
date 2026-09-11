"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { importLeads, type ImportResult, type ImportRow } from "@/app/leads/actions";
import { useT } from "@/components/i18n/LocaleProvider";

type TargetField = "name" | "phone" | "email" | "source" | "value";

const AUTO_HINTS: Record<TargetField, string[]> = {
  name: ["name", "имя", "фио", "клиент", "контакт", "full name"],
  phone: ["phone", "телефон", "tel", "номер"],
  email: ["email", "e-mail", "почта", "мейл"],
  source: ["source", "источник"],
  value: ["value", "сумма", "price", "бюджет", "amount", "стоимость"],
};

function guessColumn(headers: string[], field: TargetField): string {
  const hints = AUTO_HINTS[field];
  const found = headers.find((h) => hints.some((hint) => h.toLowerCase().includes(hint)));
  return found ?? "";
}

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const FIELD_LABELS: Record<TargetField, string> = useMemo(
    () => ({
      name: t("colName"),
      phone: t("fieldPhone"),
      email: t("fieldEmail"),
      source: t("fieldSource"),
      value: t("colAmount"),
    }),
    [t]
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<TargetField, string>>({
    name: "",
    phone: "",
    email: "",
    source: "",
    value: "",
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState(false);

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) {
        setParseError(parsed.errors[0].message);
        return;
      }
      const fields = parsed.meta.fields ?? [];
      setHeaders(fields);
      setRows(parsed.data);
      setMapping({
        name: guessColumn(fields, "name"),
        phone: guessColumn(fields, "phone"),
        email: guessColumn(fields, "email"),
        source: guessColumn(fields, "source"),
        value: guessColumn(fields, "value"),
      });
    };
    reader.readAsText(file, "utf-8");
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function handleImport() {
    if (!mapping.name) {
      setParseError(t("errSelectNameColumn"));
      return;
    }
    setPending(true);
    const payload: ImportRow[] = rows.map((row) => ({
      name: row[mapping.name] ?? "",
      phone: mapping.phone ? row[mapping.phone] : null,
      email: mapping.email ? row[mapping.email] : null,
      source: mapping.source ? row[mapping.source] : null,
      value: mapping.value ? Number(String(row[mapping.value]).replace(",", ".")) : null,
    }));
    const res = await importLeads(payload);
    setPending(false);
    setResult(res);
    if (!res.error) {
      setTimeout(onClose, 1200);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{t("headingImportLeads")}</h3>
        <p className="mt-1 text-sm text-muted">{t("importLeadsSubtitle")}</p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted hover:border-accent">
          <span>{fileName ?? t("placeholderChooseCsv")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {parseError && (
          <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
            {parseError}
          </p>
        )}

        {headers.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(Object.keys(FIELD_LABELS) as TargetField[]).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-ink-2">
                    {FIELD_LABELS[field]}
                    {field === "name" && " *"}
                  </span>
                  <select
                    value={mapping[field]}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field]: e.target.value }))
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    <option value="">{t("optionDoNotUse")}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <p className="mt-4 text-xs font-medium text-ink-2">
              {t("previewHeading", { n: rows.length })}
            </p>
            <div className="mt-1 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    {(Object.keys(FIELD_LABELS) as TargetField[]).map((field) => (
                      <th key={field} className="px-2 py-1.5 font-medium">
                        {FIELD_LABELS[field]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {(Object.keys(FIELD_LABELS) as TargetField[]).map((field) => (
                        <td key={field} className="px-2 py-1.5 text-ink-2">
                          {mapping[field] ? row[mapping[field]] ?? "" : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {result && (
          <p
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              result.error
                ? "bg-accent/10 text-accent-strong"
                : "bg-surface-2 text-ink-2"
            }`}
          >
            {result.error === "errImportPartial" && result.partialFailure
              ? t("errImportPartial", {
                  imported: result.imported,
                  total: result.partialFailure.total,
                  message: result.partialFailure.message,
                })
              : result.error
              ? t(result.error)
              : result.duplicatesSkipped
              ? t("importedCountWithDuplicates", { n: result.imported, d: result.duplicatesSkipped })
              : t("importedCount", { n: result.imported })}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleImport}
            disabled={pending || rows.length === 0}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? t("btnImporting") : t("btnImportCount", { n: rows.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
