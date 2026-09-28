// Франчайзи-аналитика для Главной (round 40, 28 сен 2026 — "Главную сделать
// с той же аналитикой, что и для клубов и так же выбор показывать клубы
// или франчайзи"). Mirrors the shape of the club/network dashboard's own
// metrics in lib/dashboard.ts (funnel, source breakdown, monthly trend,
// stale candidates), but built against franchise_candidates/
// franchise_stage_history instead of leads/members/payments — there's no
// money here (no "выручка"/"роялти" for a franchise candidate), so those
// club-only pieces of CoreMetrics have no equivalent below.

import { FRANCHISE_STAGES, franchiseStageLabel, type FranchiseStageId } from "@/lib/franchise";
import { currentMonthKey, lastNMonthKeys, monthKeyOf, pctOf, type Period } from "@/lib/dashboard";
import type { Locale } from "@/lib/i18n";

export type FranchiseCandidateRow = {
  id: string;
  name: string;
  stage: string;
  source: string | null;
  submitted_at: string;
  updated_at: string;
};

export type FranchiseFunnelStage = {
  id: FranchiseStageId;
  labelKey: string;
  count: number;
  pctFromFirst: number | null;
};

/** Same forward-funnel idea as computeFunnel in lib/dashboard.ts, applied
 * to the 15-stage franchise pipeline (declined/paused excluded from the
 * "forward" line — a candidate who reached fin_model_sent before declining
 * still counts as having reached it, same as leads' own funnel). */
export function computeFranchiseFunnel(candidates: { stage: string }[]): FranchiseFunnelStage[] {
  const forward = FRANCHISE_STAGES.filter((s) => !s.lost);
  const counts = forward.map(
    (_, i) => candidates.filter((c) => forward.findIndex((f) => f.id === c.stage) >= i).length
  );
  return forward.map((s, i) => ({
    id: s.id,
    labelKey: s.labelKey,
    count: counts[i],
    pctFromFirst: i === 0 ? null : pctOf(counts[i], counts[0]),
  }));
}

export type FranchiseSourceBreakdown = {
  source: string;
  count: number;
  activeCount: number;
  pctActive: number | null;
};

export function computeFranchiseSourceBreakdown(
  candidates: { source: string | null; stage: string }[]
): FranchiseSourceBreakdown[] {
  const bySource = new Map<string, { total: number; active: number }>();
  for (const c of candidates) {
    const key = c.source ?? "";
    const entry = bySource.get(key) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (c.stage === "active") entry.active += 1;
    bySource.set(key, entry);
  }
  return [...bySource.entries()]
    .map(([source, { total, active }]) => ({
      source,
      count: total,
      activeCount: active,
      pctActive: pctOf(active, total),
    }))
    .sort((a, b) => b.count - a.count);
}

/** % of all candidates in `rows` currently at "active" — same "no
 * fabricated number" rule as leads' own conversionRate (null, not 0, with
 * nothing to divide by). */
export function franchiseConversionRate(rows: { stage: string }[]): number | null {
  return rows.length === 0 ? null : pctOf(rows.filter((c) => c.stage === "active").length, rows.length);
}

export function franchiseMonthsWithActivity(candidates: { submitted_at: string }[], limit = 6): string[] {
  const set = new Set<string>([currentMonthKey()]);
  candidates.forEach((c) => set.add(monthKeyOf(c.submitted_at)));
  return [...set].sort().reverse().slice(0, limit);
}

export function franchiseYearsWithActivity(candidates: { submitted_at: string }[]): string[] {
  const set = new Set<string>([currentMonthKey().slice(0, 4)]);
  candidates.forEach((c) => set.add(c.submitted_at.slice(0, 4)));
  return [...set].sort().reverse();
}

export type MonthlyCount = { monthKey: string; value: number };

/** New candidates submitted in each of the last `months` calendar months —
 * same "real rows, no smoothing" rule as monthlyRevenue/monthlyMemberTotal. */
export function monthlyFranchiseSubmissions(candidates: { submitted_at: string }[], months = 6): MonthlyCount[] {
  return lastNMonthKeys(months).map((monthKey) => ({
    monthKey,
    value: candidates.filter((c) => monthKeyOf(c.submitted_at) === monthKey).length,
  }));
}

export const STALE_CANDIDATE_DAYS = 10;

export type StaleFranchiseCandidate = {
  id: string;
  name: string;
  stage: string;
  daysSinceUpdate: number;
};

/** Candidates not in a terminal stage whose card hasn't moved in a while —
 * same idea and threshold-style as findStaleLeads, just a longer default
 * window (10 days, not 5): a franchise candidate's own cadence — a signed
 * contract, a Kristina/Lyudmila call — naturally moves slower than a club
 * lead's. */
export function findStaleFranchiseCandidates(
  candidates: { id: string; name: string; stage: string; updated_at: string }[],
  now: Date = new Date()
): StaleFranchiseCandidate[] {
  const msPerDay = 24 * 60 * 60 * 1000;
  return candidates
    .filter((c) => c.stage !== "active" && c.stage !== "declined" && c.stage !== "paused")
    .map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      daysSinceUpdate: Math.floor((now.getTime() - new Date(c.updated_at).getTime()) / msPerDay),
    }))
    .filter((c) => c.daysSinceUpdate > STALE_CANDIDATE_DAYS)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

export { franchiseStageLabel };
export type { Locale };
