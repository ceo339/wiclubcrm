import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import { baseInvoiceNumber, defaultInvoiceDescription, type InvoiceData } from "./franchisor";

// Round 49: turning a franchise_payments row into an invoice. Works with
// either the signed-in user's client (downloads — RLS decides who can see
// the invoice) or the admin client (email sending, cron).

type Db = SupabaseClient<Database>;
export type InvoicePayment = Tables<"franchise_payments">;
export type InvoiceCandidate = Pick<
  Tables<"franchise_candidates">,
  | "id"
  | "name"
  | "email"
  | "phone"
  | "billing_name"
  | "billing_address"
  | "agreement_number"
  | "agreement_date"
>;

export const INVOICE_CANDIDATE_FIELDS =
  "id, name, email, phone, billing_name, billing_address, agreement_number, agreement_date";

export function toInvoiceData(p: InvoicePayment, c: InvoiceCandidate): InvoiceData {
  return {
    number: p.invoice_number ?? baseInvoiceNumber(p.invoice_date),
    date: p.invoice_date,
    dueDate: p.due_date,
    currency: p.currency || "USD",
    franchisee: {
      name: c.billing_name?.trim() || c.name,
      address: c.billing_address?.trim() || null,
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
    },
    agreement: { number: c.agreement_number?.trim() || null, date: c.agreement_date },
    lines: [
      {
        description: p.description?.trim() || defaultInvoiceDescription(p.kind, p.period_month),
        quantity: 1,
        price: Number(p.amount),
      },
    ],
  };
}

export async function loadInvoice(
  db: Db,
  paymentId: string
): Promise<{ payment: InvoicePayment; candidate: InvoiceCandidate; data: InvoiceData } | null> {
  const { data: payment } = await db.from("franchise_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return null;
  const { data: candidate } = await db
    .from("franchise_candidates")
    .select(INVOICE_CANDIDATE_FIELDS)
    .eq("id", payment.candidate_id)
    .maybeSingle();
  if (!candidate) return null;
  return { payment, candidate, data: toInvoiceData(payment, candidate) };
}

/** Finance director's convention: DDMMYYYY of the invoice date, "-2", "-3"…
 * for further invoices the same day. */
export async function nextInvoiceNumber(db: Db, invoiceDate: string): Promise<string> {
  const base = baseInvoiceNumber(invoiceDate);
  const { data } = await db.from("franchise_payments").select("invoice_number").like("invoice_number", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.invoice_number));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
