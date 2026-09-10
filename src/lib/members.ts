// Shared constants for the Members feature — mirrors the status vocabulary
// from the prototype (velora-final2.html), minus the demo-only fake
// churn-risk scoring, which wasn't backed by real data.

export type MemberStatus =
  | "sAwaiting"
  | "sPaid"
  | "sFailed"
  | "sCompleted"
  | "sRefunded"
  | "sCancelled";

export const STATUSES: { id: MemberStatus; label: string }[] = [
  { id: "sAwaiting", label: "Записалась · не оплатила" },
  { id: "sPaid", label: "Оплачено" },
  { id: "sCompleted", label: "Завершила курс" },
  { id: "sFailed", label: "Не прошло" },
  { id: "sRefunded", label: "Возврат" },
  { id: "sCancelled", label: "Отменила запись" },
];

export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;

/** "MM.YYYY", matching the prototype's member_since format. */
export function currentMonthYear(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}.${now.getFullYear()}`;
}
