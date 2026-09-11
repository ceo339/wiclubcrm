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

/**
 * Which month a course/enrollment counts toward everywhere on this
 * dashboard (the participant widget, revenue, the running member total) —
 * Anastasiia's rule (11 сен 2026): "по дате старта. если дата старта была
 * в августе, то это считается в август" — the month the course actually
 * STARTS, not the month it was sold or the card was created. Falls back to
 * when the enrollment itself was created only when no start date has been
 * picked yet (a sold course with no stream assigned), so it still shows up
 * somewhere rather than vanishing from every count.
 */
export function enrollmentAttributionDate(e: { start_date: string | null; created_at: string }): string {
  return e.start_date ?? e.created_at.slice(0, 10);
}

/** Same idea as enrollmentAttributionDate, for a lead that hasn't (yet, or
 * ever) become a member — the course/stream she was offered at
 * `cohort_start_date`, falling back to when the lead itself was added. */
export function leadCohortDate(l: { cohort_start_date: string | null; added_date: string }): string {
  return l.cohort_start_date ?? l.added_date;
}

export type PaymentContext = {
  paid_date: string;
  enrollment: { start_date: string | null; created_at: string } | null;
  lead: { cohort_start_date: string | null; added_date: string } | null;
};

/**
 * Which month a payment counts toward — "выручка считается по
 * предоставленной услуге (старту курса)" (Anastasiia, 11 сен 2026). Prefers
 * the course it was actually for (via its enrollment); before she's been
 * converted to a member yet, falls back to the lead's own chosen stream
 * (see leadCohortDate); only a payment with neither attached (an old row,
 * or one never tied to a course at all) falls back to its own paid_date.
 */
export function paymentAttributionDate(p: PaymentContext): string {
  if (p.enrollment) return enrollmentAttributionDate(p.enrollment);
  if (p.lead) return leadCohortDate(p.lead);
  return p.paid_date;
}

/** Every month with real activity in the given rows, plus the current month
 * even if it's still empty. Never a fabricated "last N months" — only
 * months that actually have (or could have) something to show. */
export function monthsWithActivity(
  leads: { added_date: string }[],
  enrollments: { start_date: string | null; created_at: string }[],
  payments: PaymentContext[],
  limit = 6
): string[] {
  const set = new Set<string>([currentMonthKey()]);
  leads.forEach((l) => set.add(monthKeyOf(l.added_date)));
  enrollments.forEach((e) => set.add(monthKeyOf(enrollmentAttributionDate(e))));
  payments.forEach((p) => set.add(monthKeyOf(paymentAttributionDate(p))));
  return [...set].sort().reverse().slice(0, limit);
}

export type MonthlyRevenue = { monthKey: string; amount: number };

/**
 * Real collected revenue for each of the last `months` calendar months,
 * oldest first, ending with the current (in-progress) month — independent
 * of the page's period filter, same as findStaleLeads/findDecliningClubs
 * below. Deliberately no projection into future months: the prototype's
 * "Что заработал клуб" widget drew a dashed forecast 2 months ahead, but
 * with a network this young there's no honest trend to extrapolate from
 * yet, and Anastasiia chose to leave it out (10 сен 2026) rather than show
 * an estimate dressed up as a chart.
 */
/** The last `months` "YYYY-MM" keys, oldest first, ending on the current
 * (in-progress) month — the shared month scaffold behind every trend below,
 * so they can never quietly disagree on which months to show. */
export function lastNMonthKeys(months: number): string[] {
  const keys: string[] = [];
  let key = currentMonthKey();
  for (let i = 0; i < months; i++) {
    keys.unshift(key);
    key = shiftMonthKey(key, -1);
  }
  return keys;
}

export function monthlyRevenue(
  payments: (PaymentContext & { amount: number; status: string | null })[],
  months = 6
): MonthlyRevenue[] {
  const paid = payments.filter((p) => p.status === "paid");
  return lastNMonthKeys(months).map((monthKey) => ({
    monthKey,
    amount: paid
      .filter((p) => monthKeyOf(paymentAttributionDate(p)) === monthKey)
      .reduce((sum, p) => sum + Number(p.amount), 0),
  }));
}

export type MonthlyCount = { monthKey: string; value: number };

/**
 * Real running total membership count at the end of each of the last
 * `months` months — how the member base actually grew, not "added this
 * month". Powers the KPI tile's sparkline the same honest way
 * monthlyRevenue powers the revenue chart: real rows, no smoothing.
 */
export function monthlyMemberTotal(
  enrollments: { start_date: string | null; created_at: string }[],
  months = 6
): MonthlyCount[] {
  return lastNMonthKeys(months).map((monthKey) => ({
    monthKey,
    value: enrollments.filter((e) => monthKeyOf(enrollmentAttributionDate(e)) <= monthKey).length,
  }));
}

/**
 * Real conversion rate (% of that month's new leads that reached "Оплата")
 * for each of the last `months` months. A month with no leads added shows
 * 0 in the sparkline rather than breaking the line — there's no "no data"
 * gap to render in a tiny trend line, unlike the KPI tile's own delta text.
 */
export function monthlyConversion(
  leads: { added_date: string; cohort_start_date: string | null; stage: string }[],
  months = 6
): MonthlyCount[] {
  return lastNMonthKeys(months).map((monthKey) => {
    const inMonth = leads.filter((l) => monthKeyOf(leadCohortDate(l)) === monthKey);
    return { monthKey, value: conversionRate(inMonth) ?? 0 };
  });
}

export function conversionRate(rows: { stage: string }[]): number | null {
  return rows.length === 0
    ? null
    : Math.round((100 * rows.filter((l) => l.stage === "paid").length) / rows.length);
}

/** `part` as a percentage of `whole`, rounded. Null (not 0 or 100) when
 * there's no real denominator to divide by — same "no fabricated number"
 * rule as pctChange above. */
export function pctOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((100 * part) / whole);
}

/**
 * One step of the "От первого «привет» до участницы" funnel — a running
 * total of leads currently at this stage or any stage further along,
 * plus what fraction of the previous step's total that represents.
 *
 * This is a snapshot over CURRENT stage, not a reconstructed history: a
 * lead's row only ever holds where it is right now, not every stage it
 * passed through. Two things follow from that, both accepted deliberately
 * (confirmed with Anastasiia rather than assumed):
 *  - it assumes leads only move forward through the Kanban — a lead
 *    dragged backward would undercount the stage it already reached;
 *  - a declined lead drops out of every step from "declined" onward,
 *    even if it had genuinely reached "Выставлен счёт" first, because
 *    that path isn't recorded anywhere. Declined leads are reported
 *    separately (`declinedCount` on CoreMetrics) rather than folded into
 *    a stage they may never have reached, but this does mean the
 *    "% идут дальше" figures run somewhat pessimistic as more leads get
 *    declined — they're a floor on real conversion, not the exact figure.
 */
export type FunnelStage = {
  id: string;
  labelKey: string;
  count: number;
  /** Null on the first stage (nothing before it) and when the previous
   * stage's count is 0 (no baseline to take a percentage of). */
  pctFromPrevious: number | null;
};

export function computeFunnel(leads: { stage: string }[]): FunnelStage[] {
  const forward = STAGES.filter((s) => !s.lost); // new → progress → presented → invoiced → paid, in order
  const counts = forward.map(
    (_, i) => leads.filter((l) => forward.findIndex((f) => f.id === l.stage) >= i).length
  );
  return forward.map((s, i) => ({
    id: s.id,
    labelKey: s.labelKey,
    count: counts[i],
    pctFromPrevious: i === 0 ? null : pctOf(counts[i], counts[i - 1]),
  }));
}

// ---------------------------------------------------------------------------
// "Какой канал приводит участниц" — real leads by source, real fraction of
// each source that reached "Оплата". "Reached Оплата" is the same stage
// the "Лид → участница" tile already uses as its definition of a won
// lead — a real, if approximate, stand-in for "стала участницей", since a
// lead becoming a member is a separate manual copy, not a hard link.

export type SourceConversion = {
  source: string;
  leadsCount: number;
  paidCount: number;
  pctPaid: number | null;
};

export function computeSourceConversion(leads: { source: string | null; stage: string }[]): SourceConversion[] {
  const bySource = new Map<string, { total: number; paid: number }>();
  for (const l of leads) {
    const key = l.source ?? "";
    const entry = bySource.get(key) ?? { total: 0, paid: 0 };
    entry.total += 1;
    if (l.stage === "paid") entry.paid += 1;
    bySource.set(key, entry);
  }
  return [...bySource.entries()]
    .map(([source, { total, paid }]) => ({
      source,
      leadsCount: total,
      paidCount: paid,
      pctPaid: pctOf(paid, total),
    }))
    .sort((a, b) => b.leadsCount - a.leadsCount);
}

export type CoreMetrics = {
  revenue: { amount: number; delta: number | null };
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
  funnel: FunnelStage[];
  declinedCount: number;
  sourceConversion: SourceConversion[];
};

/**
 * The KPI block shared by the network dashboard and every club's own
 * dashboard — same formulas either way, the only difference is which rows
 * were fetched (all clubs vs. one). Keeping this in one place means the two
 * pages can never quietly drift apart on how a number is computed.
 */
export function computeCoreMetrics({
  leads,
  enrollments,
  payments,
  period,
}: {
  leads: { stage: string; added_date: string; cohort_start_date: string | null; source: string | null }[];
  enrollments: { start_date: string | null; created_at: string }[];
  payments: (PaymentContext & { amount: number; status: string | null })[];
  period: Period;
}): CoreMetrics {
  const paid = payments.filter((p) => p.status === "paid");
  const revenue = paid
    .filter((p) => inPeriod(period, paymentAttributionDate(p)))
    .reduce((s, p) => s + Number(p.amount), 0);
  const revenuePrevious = paid
    .filter((p) => inPreviousMonth(period, paymentAttributionDate(p)))
    .reduce((s, p) => s + Number(p.amount), 0);

  // "участниц на главной считать по дате старта" (Anastasiia, 11 сен
  // 2026) — counts course ENROLLMENTS whose start date falls in this
  // period, not members whose card was created then; a member with two
  // courses starting in different months is counted in both.
  const membersAdded = enrollments.filter((e) => inPeriod(period, enrollmentAttributionDate(e))).length;

  // Funnel / declined / source-conversion below stay on the lead's own
  // added_date (unchanged) — only the headline "Лид → Оплата" conversion
  // rate moves to the course's own start date ("конверсия из лида в
  // оплаты — аналогично", same request, 11 сен 2026): that's the one
  // figure she asked to follow the course calendar rather than when the
  // lead first came in.
  const leadsInPeriod = leads.filter((l) => inPeriod(period, l.added_date));

  const conversionLeadsInPeriod = leads.filter((l) => inPeriod(period, leadCohortDate(l)));
  const conversionLeadsPrevious = leads.filter((l) => inPreviousMonth(period, leadCohortDate(l)));
  const conversion = conversionRate(conversionLeadsInPeriod);
  const conversionPrevious = period.mode === "month" ? conversionRate(conversionLeadsPrevious) : null;

  const royaltyAmount = Math.round((revenue * ROYALTY_PERCENT) / 100);

  return {
    revenue: { amount: revenue, delta: period.mode === "month" ? pctChange(revenue, revenuePrevious) : null },
    membersAdded,
    conversion: { value: conversion, previous: conversionPrevious },
    royalty: { amount: royaltyAmount, percent: ROYALTY_PERCENT },
    funnel: computeFunnel(leadsInPeriod),
    declinedCount: leadsInPeriod.filter((l) => l.stage === "declined").length,
    sourceConversion: computeSourceConversion(leadsInPeriod),
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
  payments: (PaymentContext & { partner_id: string; amount: number; status: string | null })[]
): DecliningClub[] {
  const paid = payments.filter((p) => p.status === "paid");
  const thisMonth = currentMonthKey();
  const prevMonth = previousMonthKey();
  const revenueFor = (partnerId: string, monthKey: string) =>
    paid
      .filter((p) => p.partner_id === partnerId && monthKeyOf(paymentAttributionDate(p)) === monthKey)
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
