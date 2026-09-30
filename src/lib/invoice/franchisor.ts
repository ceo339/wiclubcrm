// Franchisor requisites printed on every franchise invoice (round 49). Taken
// verbatim from the finance director's own Word invoice (invoice_0709026.pdf,
// 7 Sep 2026). If the bank account, address or signatory ever changes, this
// is the one place to edit.

export const FRANCHISOR = {
  name: "WOMAN INSIGHT Inc",
  address: "345 FOREST AVE APT 304 PALO ALTO CA94301-2519",
  ein: "88-2509189",
  bankName: "JPMorgan Chase Bank",
  bankAddress: "N.A. 300 Hamilton Ave, Palo Alto, CA 94301, USA",
  account: "2909631032",
  routing: "021000021",
  swift: "CHASUS33",
  signatory: "Svitlana Kerymova",
} as const;

/** Everything a single invoice needs — built from a franchise_payments row +
 * its franchise_candidates row (see loadInvoiceData in ./data.ts). */
export type InvoiceData = {
  number: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  dueDate: string | null;
  currency: string;
  franchisee: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  agreement: { number: string | null; date: string | null };
  lines: { description: string; quantity: number; price: number }[];
};

export function invoiceTotal(d: InvoiceData): number {
  return d.lines.reduce((s, l) => s + l.quantity * l.price, 0);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-09-07" → "September 07, 2026" (same style as the Word template). */
export function formatInvoiceDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${d}, ${y}`;
}

/** "2026-06-01" → "June 1, 2026" (agreement line). */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/** "2026-08-01" → "August 2026" */
export function formatMonth(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** Amounts: 101 → "101", 1500.5 → "1,500.50" */
export function formatAmount(n: number): string {
  const whole = Number.isInteger(n);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Default English line description per payment kind (editable per invoice). */
export function defaultInvoiceDescription(kind: string, periodMonth: string | null): string {
  switch (kind) {
    case "royalty":
      return `Payment of royalties and marketing fund contributions for ${
        periodMonth ? formatMonth(periodMonth) : "[month]"
      } (Clause 3.1 of the Franchise Agreement)`;
    case "lump_sum":
      return "Payment of the initial franchise fee (lump sum) under the Franchise Agreement";
    case "training":
      return "Payment for training services under the Franchise Agreement";
    default:
      return "Payment under the Franchise Agreement";
  }
}

/** Invoice numbers follow the finance director's convention: the invoice date
 * as DDMMYYYY (07.09.2026 → "07092026"). A second invoice on the same day
 * gets "-2", "-3", … */
export function baseInvoiceNumber(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}${m}${y}`;
}

export function invoiceFileName(d: InvoiceData, ext: "pdf" | "docx"): string {
  const who = d.franchisee.name.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `Invoice_${d.number}${who ? `_${who}` : ""}.${ext}`;
}
