import { ROYALTY_PERCENT } from "@/lib/royalty";
import { STAGES } from "@/lib/leads";

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

// ---------------------------------------------------------------------------
// Period selection — shared by the network dashboard and each club's own
// dashboard. A period is either one calendar month, or an arbitrary custom
// "from/to" date range. Only month mode has a well-defined "previous period"
// to compare against.

export type Period = { mode: "month"; month: string } | { mode: "range"; from: string; to: string };

export function parsePeriodParams(params: {
  month?: string;
  from?: string;
  to?: string;
}): Period {
  const rangeFrom = params.from && isValidDateStr(params.from) ? params.from : null;
  const rangeTo = params.to && isValidDateStr(params.to) ? params.to : null;
  if (rangeFrom && rangeTo && rangeFrom <= rangeTo) {
    return { mode: "range", from: rangeFrom, to: rangeTo };
  }
  const month = params.month && isValidMonthKey(params.month) ? params.month : currentMonthKey();
  return { mode: "month", month };
}

export function inPeriod(period: Period, dateStr: string): boolean {
  return period.mode === "range"
    ? dateStr.slice(0, 10) >= period.from && dateStr.slice(0, 10) <= period.to
    : monthKeyOf(dateStr) === period.month;
}

/** False for every row in range mode — a custom range has no "previous period". */
export function inPreviousMonth(period: Period, dateStr: string): boolean {
  if (period.mode !== "month") return false;
  return monthKeyOf(dateStr) === shiftMonthKey(period.month, -1);
}

export function periodLabel(period: Period): string {
  return period.mode === "month"
    ? monthLabel(period.month)
    : `${formatDateRu(period.from)} – ${formatDateRu(period.to)}`;
}

/** Every month with real activity in the given rows, plus the current month
 * even if it's still empty. Never a fabricated "last N months" — only
 * months that actually have (or could have) something to show. */
export function monthsWithActivity(
  leads: { added_date: string }[],
  members: { created_at: string }[],
  payments: { paid_date: string }[],
  limit = 6
): string[] {
  const set = new Set<string>([currentMonthKey()]);
  leads.forEach((l) => set.add(monthKeyOf(l.added_date)));
  members.forEach((m) => set.add(monthKeyOf(m.created_at)));
  payments.forEach((p) => set.add(monthKeyOf(p.paid_date)));
  return [...set].sort().reverse().slice(0, limit);
}

export function conversionRate(rows: { stage: string }[]): number | null {
  return rows.length === 0
    ? null
    : Math.round((100 * rows.filter((l) => l.stage === "paid").length) / rows.length);
}

export type StageCount = { id: string; label: string; count: number };

export type CoreMetrics = {
  revenue: { amount: number; delta: number | null };
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
  stageCounts: StageCount[];
};

/**
 * The KPI block shared by the network dashboard and every club's own
 * dashboard — same formulas either way, the only difference is which rows
 * were fetched (all clubs vs. one). Keeping this in one place means the two
 * pages can never quietly drift apart on how a number is computed.
 */
export function computeCoreMetrics({
  leads,
  members,
  payments,
  period,
}: {
  leads: { stage: string; added_date: string }[];
  members: { created_at: string }[];
  payments: { amount: number; status: string | null; paid_date: string }[];
  period: Period;
}): CoreMetrics {
  const paid = payments.filter((p) => p.status === "paid");
  const revenue = paid.filter((p) => inPeriod(period, p.paid_date)).reduce((s, p) => s + Number(p.amount), 0);
  const revenuePrevious = paid
    .filter((p) => inPreviousMonth(period, p.paid_date))
    .reduce((s, p) => s + Number(p.amount), 0);

  const membersAdded = members.filter((m) => inPeriod(period, m.created_at)).length;

  const leadsInPeriod = leads.filter((l) => inPeriod(period, l.added_date));
  const leadsPrevious = leads.filter((l) => inPreviousMonth(period, l.added_date));
  const conversion = conversionRate(leadsInPeriod);
  const conversionPrevious = period.mode === "month" ? conversionRate(leadsPrevious) : null;

  const royaltyAmount = Math.round((revenue * ROYALTY_PERCENT) / 100);

  return {
    revenue: { amount: revenue, delta: period.mode === "month" ? pctChange(revenue, revenuePrevious) : null },
    membersAdded,
    conversion: { value: conversion, previous: conversionPrevious },
    royalty: { amount: royaltyAmount, percent: ROYALTY_PERCENT },
    stageCounts: STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      count: leadsInPeriod.filter((l) => l.stage === s.id).length,
    })),
  };
}

// ---------------------------------------------------------------------------
// "Участницы по продуктам" — how many members are on each course/product.
// Members with no product_id are bucketed as "Без привязки к курсу" rather
// than silently dropped, so the counts always add up to the real total.

export type ProductCount = { name: string; count: number };

export function countByProduct(
  members: { product_id: string | null }[],
  productNamesById: Map<string, string>
): ProductCount[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const name = m.product_id ? productNamesById.get(m.product_id) ?? "Удалённый курс" : "Без привязки к курсу";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
}
