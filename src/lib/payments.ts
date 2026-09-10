// Shared constants for the Payments feature. This is a manual ledger of
// payments the partner has actually received or expects — not a payment
// processor integration (the prototype's "Take payment" / "Send payment
// link" / Stripe-style automations don't correspond to anything real here,
// so they weren't ported).

import { t, type Locale } from "@/lib/i18n";

export type PaymentStatus = "paid" | "pending" | "refunded";

const STATUS_LABEL_KEYS: Record<string, string> = {
  paid: "payStatusPaid",
  pending: "payStatusPending",
  refunded: "payStatusRefunded",
};

export const STATUSES: { id: PaymentStatus }[] = [
  { id: "paid" },
  { id: "pending" },
  { id: "refunded" },
];

export const statusLabel = (id: string, locale: Locale) => {
  const key = STATUS_LABEL_KEYS[id];
  return key ? t(locale, key) : id;
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
