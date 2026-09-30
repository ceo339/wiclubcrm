// Франчайзи-аналитика для Главной (round 40, 28 сен 2026 — "Главную сделать
// с той же аналитикой, что и для клубов и так же выбор показывать клубы
// или франчайзи"). Mirrors the shape of the club/network dashboard's own
// metrics in lib/dashboard.ts (funnel, source breakdown, monthly trend,
// stale candidates), but built against franchise_candidates/
// franchise_stage_history instead of leads/members/payments — there's no
// money here (no "выручка"/"роялти" for a franchise candidate), so those
// club-only pieces of CoreMetrics have no equivalent below.

import {
  FRANCHISE_TERMINAL_STAGES,
  VISIBLE_FRANCHISE_STAGES,
  franchiseStageLabel,
  type FranchiseStageId,
} from "@/lib/franchise";
import { currentMonthKey, inPeriod, lastNMonthKeys, monthKeyOf, pctOf, type Period } from "@/lib/dashboard";
import { approximateLocation } from "@/lib/geo";
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
 * still counts as having reached it, same as leads' own funnel).
 *
 * `fromStageId` (round 44, 29 сен 2026 — "на вкладке квалификация воронка
 * отображалась со стадии фин модель отправлена") truncates the funnel to
 * start at a later stage instead of the very first one — the "Квалифи-
 * цированные" tab's own funnel, scoped to the candidates it already shows,
 * has no reason to repeat the application/interview stages every candidate
 * on that tab has already passed. */
export function computeFranchiseFunnel(
  candidates: { stage: string }[],
  fromStageId?: FranchiseStageId
): FranchiseFunnelStage[] {
  const allForward = VISIBLE_FRANCHISE_STAGES.filter((s) => !s.lost);
  const startIdx = fromStageId ? Math.max(0, allForward.findIndex((s) => s.id === fromStageId)) : 0;
  const forward = allForward.slice(startIdx);
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

// ---------------------------------------------------------------------
// Round 42 (28 сен 2026): "виджет новых за неделю заявок", "воронку
// строить тоже за неделю", "сколько проведено интервью за неделю и за все
// время" — a fixed rolling 7-day window from now, distinct from the
// month/year period selector above (that one answers "what happened in
// August"; this always answers "what happened in the last 7 days",
// whatever day it is today).

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isWithinLastWeek(dateStr: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(dateStr).getTime() <= WEEK_MS;
}

export function weeklyFranchiseCandidates<T extends { submitted_at: string }>(
  candidates: T[],
  now: Date = new Date()
): T[] {
  return candidates.filter((c) => isWithinLastWeek(c.submitted_at, now));
}

/**
 * "Добавь договор отправлен за неделю/ за выбранный период" (Anastasiia,
 * round 46 part 2) — counts TRANSITIONS onto `stage` within the dashboard's
 * month/year/range period, from franchise_stage_history.occurred_at, not
 * "how many candidates currently sit on this stage right now": a candidate
 * usually moves off "Договор отправлен" within days (onto "Договор
 * подписан" or a decline), so a current-stage count would read near-zero
 * almost all the time and say nothing about how much of this actually
 * happened in the period — same reasoning as latestActivityByCandidate
 * above for why history, not a snapshot column, is the real signal here.
 */
export function countStageTransitionsInPeriod(
  history: { stage: string; occurred_at: string }[],
  stage: string,
  period: Period
): number {
  return history.filter((r) => r.stage === stage && inPeriod(period, r.occurred_at)).length;
}

export type InterviewStats = { week: number; allTime: number };

/** Counts DISTINCT candidates who ever logged an "Собеседование пройдено"
 * (interview_done) transition in franchise_stage_history — not raw rows,
 * so a card that somehow re-crosses the same stage twice doesn't double an
 * interview that only happened once. */
export function computeInterviewStats(
  interviewDoneHistory: { candidate_id: string; occurred_at: string }[],
  now: Date = new Date()
): InterviewStats {
  // Earliest qualifying row per candidate (round 48: rows now come from both
  // interview_done and fin_model_sent) — so the week count reflects when the
  // interview first happened, not a later re-crossing.
  const first = new Map<string, string>();
  for (const r of interviewDoneHistory) {
    const prev = first.get(r.candidate_id);
    if (!prev || r.occurred_at < prev) first.set(r.candidate_id, r.occurred_at);
  }
  let week = 0;
  for (const at of first.values()) if (isWithinLastWeek(at, now)) week++;
  return { week, allTime: first.size };
}

export { franchiseStageLabel };
export type { Locale };

// ---------------------------------------------------------------------
// «Дашборд партнёров» (round 46) — новый блок вверху Главной, скоуп —
// PARTNER_STAGES (кандидатки, дошедшие до «Собеседование пройдено» или
// дальше, включая отказ/паузу после этого — см. PARTNER_STAGES в
// lib/franchise.ts). Компонент NetworkSummaryPanel.tsx рендерит то, что
// эти функции считают.

const FORWARD_NONTERMINAL = VISIBLE_FRANCHISE_STAGES.filter((s) => !s.lost);
const CONTRACT_SIGNED_IDX = FORWARD_NONTERMINAL.findIndex((s) => s.id === "contract_signed");

function isContractOrLater(stage: string): boolean {
  const idx = FORWARD_NONTERMINAL.findIndex((s) => s.id === stage);
  return idx >= 0 && idx >= CONTRACT_SIGNED_IDX;
}

export type NetworkSummary = {
  /** "Всего заявок (на всех стадиях)" (Anastasiia, round 46, feedback on
   * v1 of this panel) — every candidate, no PARTNER_STAGES-style narrowing
   * (that narrower scope was tried first, then explicitly walked back). */
  totalAll: number;
  weeklyAll: number;
  activeClubs: number;
  /** "ЗАЯВКА → АКТИВНА это перенеси наверх и считается за все время"
   * (Anastasiia, round 46 part 2) — moved up from the lower funnel-tiles row
   * into this top block. Always computed against every candidate passed in
   * here (this function is only ever called with the full, unfiltered
   * candidate list — see FranchiseHomeDashboard.tsx), never the month/year
   * period selector, so "за все время" holds by construction rather than
   * needing a second period-aware code path. */
  conversionRate: number | null;
};

export function computeNetworkSummary(candidates: { stage: string; submitted_at: string }[]): NetworkSummary {
  return {
    totalAll: candidates.length,
    weeklyAll: weeklyFranchiseCandidates(candidates).length,
    activeClubs: candidates.filter((c) => c.stage === "active").length,
    conversionRate: franchiseConversionRate(candidates),
  };
}

export type NetworkStructure = { beforeContract: number; contractPlus: number; terminal: number };

/** Донат «Структура сети» — три сегмента, которые в сумме всегда дают
 * total (в отличие от исходного макета-референса, где «Стран» и
 * «География» не сходились друг с другом). */
export function computeNetworkStructure(candidates: { stage: string }[]): NetworkStructure {
  const terminal = candidates.filter((c) => FRANCHISE_TERMINAL_STAGES.includes(c.stage as FranchiseStageId)).length;
  const contractPlus = candidates.filter((c) => isContractOrLater(c.stage)).length;
  const beforeContract = candidates.length - terminal - contractPlus;
  return { beforeContract, contractPlus, terminal };
}

export type CountryBreakdownRow = { country: string; count: number };

export type ApproxGeography = {
  countries: CountryBreakdownRow[];
  /** Число РАСПОЗНАННЫХ городов (не общее число target_city — то поле такое
   * же "грязное" свободнотекстовое, как и country). */
  citiesRecognized: number;
  matchedCount: number;
  unmatchedCount: number;
};

/** "Примерное сопоставление" (Anastasiia, round 46, после того как
 * проверили реальные данные — country это не нормализованная страна, а
 * свободный текст анкеты). Кандидатки, чей текст не удалось сопоставить ни
 * с одной известной страной/городом, просто не попадают в разбивку —
 * unmatchedCount существует именно чтобы это было видно, а не молчаливо
 * терялось. */
export function computeApproxGeography(candidates: { country: string | null }[]): ApproxGeography {
  const byCountry = new Map<string, number>();
  const cities = new Set<string>();
  let matched = 0;
  for (const c of candidates) {
    const hit = approximateLocation(c.country);
    if (!hit) continue;
    matched += 1;
    byCountry.set(hit.country, (byCountry.get(hit.country) ?? 0) + 1);
    if (hit.city) cities.add(hit.city);
  }
  return {
    countries: [...byCountry.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    citiesRecognized: cities.size,
    matchedCount: matched,
    unmatchedCount: candidates.length - matched,
  };
}

export type RecentActivityItem = {
  id: string;
  name: string;
  stage: string;
  city: string | null;
  lastActivityAt: string;
  /** "если там есть отказ, то показывай и причину отказа" (Anastasiia,
   * round 46 part 2) — shown instead of the city for declined/paused rows. */
  rejectReason: string | null;
};

/** franchise_candidates.updated_at оказался бесполезен для «Недавней
 * активности» — на проде это сплошные пачки по 30 строк в одну и ту же
 * минуту (следы массового бэкафилла/импорта, не реальных действий).
 * Настоящий сигнал — franchise_stage_history.occurred_at (реальная дата
 * КАЖДОГО перехода по стадии), отсюда и отдельный параметр history вместо
 * candidate.updated_at. */
export function latestActivityByCandidate(history: { candidate_id: string; occurred_at: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of history) {
    const prev = map.get(row.candidate_id);
    if (!prev || new Date(row.occurred_at).getTime() > new Date(prev).getTime()) {
      map.set(row.candidate_id, row.occurred_at);
    }
  }
  return map;
}

export function computeRecentActivity(
  candidates: {
    id: string;
    name: string;
    stage: string;
    target_city: string | null;
    submitted_at: string;
    reject_reason: string | null;
  }[],
  lastActivityById: Map<string, string>,
  limit = 6
): RecentActivityItem[] {
  return candidates
    .map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      city: c.target_city,
      lastActivityAt: lastActivityById.get(c.id) ?? c.submitted_at,
      rejectReason: c.reject_reason,
    }))
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, limit);
}

export type RelativeTimeParts =
  | { key: "relTimeJustNow"; n?: undefined }
  | { key: "relTimeMinutes" | "relTimeHours" | "relTimeDays"; n: number };

export function relativeTimeParts(dateStr: string, now: Date = new Date()): RelativeTimeParts {
  const ms = Math.max(0, now.getTime() - new Date(dateStr).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return { key: "relTimeJustNow" };
  if (minutes < 60) return { key: "relTimeMinutes", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "relTimeHours", n: hours };
  const days = Math.floor(hours / 24);
  return { key: "relTimeDays", n: days };
}
