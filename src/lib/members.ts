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

/**
 * Normalizes the `attended` jsonb column into a fixed-length array (one slot
 * per session): true = present, false = absent, null = not yet marked.
 * Shared by the per-member card tracker and the group attendance grid so
 * both read the same stored shape the same way.
 */
export function attendedArray(raw: unknown, length: number): (boolean | null)[] {
  const arr = Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: (boolean | null)[] = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    out.push(v === true ? true : v === false ? false : null);
  }
  return out;
}
