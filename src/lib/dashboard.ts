import { ROYALTY_PERCENT } from "@/lib/royalty";
import { STAGES } from "@/lib/leads";
import { t, type Locale } from "@/lib/i18n";

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

const MONTH_KEYS = [
  "monthJan",
  "monthFeb",
  "monthMar",
  "monthApr",
  "monthMay",
  "monthJun",
  "monthJul",
  "monthAug",
  "monthSep",
  "monthOct",
  "monthNov",
  "monthDec",
];

/** "2026-09" -> "Сентябрь 2026" (or the Bulgarian equivalent) */
export function monthLabel(monthKey: string, locale: Locale): string {
  const [y, m] = monthKey.split("-").map(Number);
  const key = MONTH_KEYS[m - 1];
  return `${key ? t(locale, key) : monthKey} ${y}`;
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "2026-09-10" -> "10.09.2026" — the DD.MM.YYYY order is the same in both
 * Russian and Bulgarian, so this doesn't need a locale. */
export function formatDateRu(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Percent change vs a previous value. Null when there's no real baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatPctDelta(
  delta: number | null,
  locale: Locale,
  suffix = t(locale, "deltaVsPrevMonth")
): string {
  if (delta === null) return t(locale, "deltaNoPrevMonth");
  if (delta === 0) return t(locale, "deltaUnchanged", { suffix });
  const arrow = delta > 0 ? "▲" : "▼";
  return t(locale, "deltaChange", { arrow, value: Math.abs(delta), suffix });
}

export function formatPointsDelta(
  current: number | null,
  previous: number | null,
  locale: Locale,
  suffix = t(locale, "deltaVsPrevMonthPts")
): string {
  if (current === null) return t(locale, "deltaNoLeadsInPeriod");
  if (previous === null) return t(locale, "deltaNoPrevMonth");
  const delta = current - previous;
  if (delta === 0) return t(locale, "deltaUnchanged", { suffix });
  const arrow = delta > 0 ? "▲" : "▼";
  return t(locale, "deltaChangePts", { arrow, value: Math.abs(delta), suffix });
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

export function periodLabel(period: Period, locale: Locale): string {
  return period.mode === "month"
    ? monthLabel(period.month, locale)
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

export type StageCount = { id: string; labelKey: string; count: number };

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
      labelKey: s.labelKey,
      count: leadsInPeriod.filter((l) => l.stage === s.id).length,
    })),
  };
}

// ---------------------------------------------------------------------------
// "Участницы по продуктам" — how many members are on each course/product.
// Members with no product_id are bucketed separately rather than silently
// dropped, so the counts always add up to the real total. A real product's
// own name is user data (not app copy) and is never translated; only the
// two special buckets ("deleted"/"unassigned") are.

export type ProductCount =
  | { kind: "product"; name: string; count: number }
  | { kind: "deleted"; count: number }
  | { kind: "unassigned"; count: number };

export function countByProduct(
  members: { product_id: string | null }[],
  productNamesById: Map<string, string>
): ProductCount[] {
  const counts = new Map<string, ProductCount>();
  for (const m of members) {
    let bucketKey: string;
    let base: ProductCount;
    if (!m.product_id) {
      bucketKey = "__unassigned__";
      base = { kind: "unassigned", count: 0 };
    } else {
      const name = productNamesById.get(m.product_id);
      if (name) {
        bucketKey = `product:${name}`;
        base = { kind: "product", name, count: 0 };
      } else {
        bucketKey = "__deleted__";
        base = { kind: "deleted", count: 0 };
      }
    }
    const existing = counts.get(bucketKey);
    counts.set(bucketKey, { ...base, count: (existing?.count ?? 0) + 1 } as ProductCount);
  }
  const sortKey = (p: ProductCount) => (p.kind === "product" ? p.name : "");
  return [...counts.values()].sort((a, b) => b.count - a.count || sortKey(a).localeCompare(sortKey(b), "ru"));
}
