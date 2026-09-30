// «Оплаты франчайзи» (round 48, 30 сен 2026) — HQ's own receivables from
// franchisees: паушальный взнос (possibly in parts), monthly royalties, and
// one-off invoices for training/extra services. All amounts in USD
// (Anastasiia's choice); the `currency` column exists so that can change
// later without a migration.

export type FranchisePaymentKind = "lump_sum" | "royalty" | "training" | "other";
export type FranchisePaymentStatus = "invoiced" | "paid" | "cancelled";

export const FRANCHISE_PAYMENT_KINDS: { id: FranchisePaymentKind; labelKey: string }[] = [
  { id: "lump_sum", labelKey: "fpKindLumpSum" },
  { id: "royalty", labelKey: "fpKindRoyalty" },
  { id: "training", labelKey: "fpKindTraining" },
  { id: "other", labelKey: "fpKindOther" },
];

export const FRANCHISE_PAYMENT_STATUSES: { id: FranchisePaymentStatus; labelKey: string }[] = [
  { id: "invoiced", labelKey: "fpStatusInvoiced" },
  { id: "paid", labelKey: "fpStatusPaid" },
  { id: "cancelled", labelKey: "fpStatusCancelled" },
];

export function isFranchisePaymentKind(v: string): v is FranchisePaymentKind {
  return FRANCHISE_PAYMENT_KINDS.some((k) => k.id === v);
}
export function isFranchisePaymentStatus(v: string): v is FranchisePaymentStatus {
  return FRANCHISE_PAYMENT_STATUSES.some((k) => k.id === v);
}

export const kindLabelKey = (id: string) => FRANCHISE_PAYMENT_KINDS.find((k) => k.id === id)?.labelKey ?? id;
export const statusLabelKey = (id: string) => FRANCHISE_PAYMENT_STATUSES.find((k) => k.id === id)?.labelKey ?? id;

/** An unpaid invoice whose due date has passed. */
export function isOverdue(p: { status: string; due_date: string | null }, today: string): boolean {
  return p.status === "invoiced" && !!p.due_date && p.due_date < today;
}

export function formatUsd(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "bg" ? "bg-BG" : "ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
