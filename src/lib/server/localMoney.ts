import { CURRENCIES, BASE_CURRENCY } from "@/lib/currency";

/**
 * Round 56 — the amount exactly as typed in the club's own currency, sent by
 * MoneyAmountField next to the EUR value as `<name>_local` +
 * `<name>_local_currency`. Returns nulls when the form was filled in EUR (or
 * the field isn't there) — the row then just has its EUR value.
 */
export type LocalFields = { local: number | null; currency: string | null };

export const NO_LOCAL: LocalFields = { local: null, currency: null };

export function readLocal(formData: FormData, name: string): LocalFields {
  const cur = String(formData.get(`${name}_local_currency`) || "").trim();
  const raw = String(formData.get(`${name}_local`) || "").replace(",", ".").trim();
  if (!cur || cur === BASE_CURRENCY || !CURRENCIES.some((c) => c.code === cur)) return NO_LOCAL;
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 0) return NO_LOCAL;
  return { local: Math.round(n * 100) / 100, currency: cur };
}

/** Sum of rows' local amounts — only if every row has one in the same currency. */
export function sumLocalRows(rows: { local: number | null | undefined; currency: string | null | undefined }[]): LocalFields {
  let cur: string | null = null;
  let total = 0;
  for (const r of rows) {
    if (r.local === null || r.local === undefined || !r.currency) return NO_LOCAL;
    if (cur && cur !== r.currency) return NO_LOCAL;
    cur = r.currency;
    total += Number(r.local);
  }
  return cur ? { local: Math.round(total * 100) / 100, currency: cur } : NO_LOCAL;
}
