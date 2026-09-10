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
// "Требует внимания" — two honest signals for HQ, computed straight from
// the same rows the rest of the dashboard already uses, nothing scored or
// predicted. Deliberately independent of the page's selected period filter:
// "no movement in 5 days" and "this month vs last" only make sense against
// real calendar time, the same way the existing month-over-month deltas
// elsewhere on this page already work.

/** A lead counts as "stuck" once it's gone this many days without an update
 * — a stage change, an edit, anything that touches the row (see the
 * `leads_set_updated_at` DB trigger, which is what keeps `updated_at`
 * honest instead of frozen at creation time). */
export const STALE_LEAD_DAYS = 5;

export type StaleLead = {
  id: string;
  name: string;
  stage: string;
  partnerName: string;
  daysSinceUpdate: number;
};

/** Active leads (not yet won or lost) with no movement in over
 * `STALE_LEAD_DAYS` days, most-stale first. A lead that already reached
 * "paid" or "declined" is done, not stuck — it's excluded on purpose. */
export function findStaleLeads(
  leads: { id: string; name: string; stage: string; updated_at: string; partner_id: string }[],
  partnerNamesById: Map<string, string>,
  now: Date = new Date()
): StaleLead[] {
  const msPerDay = 24 * 60 * 60 * 1000;
  return leads
    .filter((l) => l.stage !== "paid" && l.stage !== "declined")
    .map((l) => ({
      id: l.id,
      name: l.name,
      stage: l.stage,
      partnerName: partnerNamesById.get(l.partner_id) ?? "",
      daysSinceUpdate: Math.floor((now.getTime() - new Date(l.updated_at).getTime()) / msPerDay),
    }))
    .filter((l) => l.daysSinceUpdate > STALE_LEAD_DAYS)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

export type DecliningClub = { id: string; name: string; delta: number };

/**
 * Clubs whose real "paid" revenue this calendar month is lower than last
 * calendar month — most-declined first. A club with no revenue at all last
 * month is skipped rather than shown as "-100%": there's no real baseline
 * to fall from, same rule `pctChange` already applies to the network-wide
 * revenue tile above.
 */
export function findDecliningClubs(
  partners: { id: string; name: string }[],
  payments: { partner_id: string; amount: number; status: string | null; paid_date: string }[]
): DecliningClub[] {
  const paid = payments.filter((p) => p.status === "paid");
  const thisMonth = currentMonthKey();
  const prevMonth = previousMonthKey();
  const revenueFor = (partnerId: string, monthKey: string) =>
    paid
      .filter((p) => p.partner_id === partnerId && monthKeyOf(p.paid_date) === monthKey)
      .reduce((sum, p) => sum + Number(p.amount), 0);

  return partners
    .map((p) => ({
      id: p.id,
      name: p.name,
      delta: pctChange(revenueFor(p.id, thisMonth), revenueFor(p.id, prevMonth)),
    }))
    .filter((c): c is DecliningClub => c.delta !== null && c.delta < 0)
    .sort((a, b) => a.delta - b.delta);
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
