// Month-over-month helpers for the HQ dashboard. All comparisons are
// against real rows (payments/members/leads) — when there's no data for
// the previous month yet (a brand-new network), we say so rather than
// showing a fabricated "+100%" or dividing by zero.

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export function previousMonthKey(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return prev.toISOString().slice(0, 7);
}

export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
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
  if (current === null) return "нет лидов в этом месяце";
  if (previous === null) return "нет данных за прошлый месяц";
  const delta = current - previous;
  if (delta === 0) return `без изменений ${suffix}`;
  const arrow = delta > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(delta)} ${suffix}`;
}
