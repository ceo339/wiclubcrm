// Shared constants for the Payments feature. This is a manual ledger of
// payments the partner has actually received or expects — not a payment
// processor integration (the prototype's "Take payment" / "Send payment
// link" / Stripe-style automations don't correspond to anything real here,
// so they weren't ported).

export type PaymentStatus = "paid" | "pending" | "refunded";

export const STATUSES: { id: PaymentStatus; label: string }[] = [
  { id: "paid", label: "Оплачено" },
  { id: "pending", label: "Ожидается" },
  { id: "refunded", label: "Возврат" },
];

export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
