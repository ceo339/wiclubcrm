// Month-over-month helpers for the HQ dashboard. All comparisons are
// against real rows (payments/members/leads) — when there's no data for
// the previous month yet (a brand-new network), we say so rather than
// showing a fabricated "+100%" or dividing by zero.

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

/** Shift a "YYYY-MM" key by `delta` months (negative goes back). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const shifted = new Date(y, m - 1 + delta, 1);
  return shifted.toISOString().slice(0, 7);
}

export function previousMonthKey(): string {
  return shiftMonthKey(currentMonthKey(), -1);
}

export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

const RU_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

/** "2026-09" -> "Сентябрь 2026" */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${RU_MONTHS[m - 1] ?? monthKey} ${y}`;
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "2026-09-10" -> "10.09.2026" */
export function formatDateRu(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Percent change vs a previous value. Null when there's no real baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatPctDelta(delta: number | null, suffix = "к прошлому месяцу"): string {
  if (delta === null) return "нет данных за прошлый месяц";
  if (delta === 0) return `без изменений ${suffix}`;
  const arrow = delta > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(delta)}% ${suffix}`;
}

export function formatPointsDelta(
  current: number | null,
  previous: number | null,
  suffix = "п.п. к прошлому месяцу"
): string {
  if (current === null) return "нет лидов за период";
  if (previous === null) return "нет данных за прошлый месяц";
  const delta = current - previous;
  if (delta === 0) return `без изменений ${suffix}`;
  const arrow = delta > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(delta)} ${suffix}`;
}
