"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { importContacts, type ContactImportResult, type ContactImportRow } from "@/app/contacts/actions";
import { useLocale } from "@/components/i18n/LocaleProvider";

type TargetField = "name" | "phone" | "email" | "city" | "country" | "birthday";

const AUTO_HINTS: Record<TargetField, string[]> = {
  name: ["name", "имя", "фио", "клиент", "контакт", "full name"],
  phone: ["phone", "телефон", "tel", "номер"],
  email: ["email", "e-mail", "почта", "мейл"],
  city: ["city", "город"],
  country: ["country", "страна"],
  birthday: ["birthday", "дата рождения", "др", "birth"],
};

function guessColumn(headers: string[], field: TargetField): string {
  const hints = AUTO_HINTS[field];
  const found = headers.find((h) => hints.some((hint) => h.toLowerCase().includes(hint)));
  return found ?? "";
}

/**
 * "нужно добавить функцию импорта контактов, тогда не будет путаницы, я
 * буду импортировать контакты, а не лиды" (Anastasiia, 13 сен 2026) —
 * a deliberately smaller sibling of leads/ImportModal.tsx: no source/value/
 * stage mapping (Контакты don't have a funnel stage at all), no duplicate-
 * skip UI (a repeat row just merges into the same Контакт — see
 * importContacts/findOrCreateContact), and no product/поток props, since
 * none of that applies to a plain list of people.
 */
export default function ImportContactsModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const FIELD_LABELS: Record<TargetField, string> = useMemo(
    () => ({
      name: t("colName"),
      phone: t("fieldPhone"),
      email: t("fieldEmail"),
      city: t("fieldCity"),
      country: t("fieldCountry"),
      birthday: t("fieldBirthday"),
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
    city: "",
    country: "",
    birthday: "",
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [pending, setPending] = useState(false);

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
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
        city: guessColumn(fields, "city"),
        country: guessColumn(fields, "country"),
        birthday: guessColumn(fields, "birthday"),
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
    const payload: ContactImportRow[] = rows.map((row) => ({
      name: row[mapping.name] ?? "",
      phone: mapping.phone ? row[mapping.phone] : null,
      email: mapping.email ? row[mapping.email] : null,
      city: mapping.city ? row[mapping.city] : null,
      country: mapping.country ? row[mapping.country] : null,
      birthday: mapping.birthday ? row[mapping.birthday] : null,
    }));
    const res = await importContacts(payload);
    setPending(false);
    setResult(res);
    if (!res.error) setTimeout(onClose, 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{t("headingImportContacts")}</h3>
        <p className="mt-1 text-sm text-muted">{t("importContactsSubtitle")}</p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted hover:border-accent">
          <span>{fileName ?? t("placeholderChooseCsv")}</span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {parseError && <p className="mt-2 text-sm text-accent-strong">{parseError}</p>}

        {headers.length > 0 && (
          <div className="mt-4 space-y-3">
            {(Object.keys(mapping) as TargetField[]).map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-ink-2">
                  {FIELD_LABELS[field]}
                  {field === "name" && " *"}
                </span>
                <select
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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

            {preview.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {headers.map((h) => (
                          <td key={h} className="px-2 py-1.5 text-ink-2">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {result && !result.error && (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
            {t("importContactsSummary", {
              created: String(result.created),
              matched: String(result.matchedExisting),
            })}
          </p>
        )}
        {result?.error && (
          <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(result.error)}</p>
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
            disabled={rows.length === 0 || pending}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? t("btnImporting") : t("btnImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
