"use client";

import FranchiseRevenueWidget from "./payments/FranchiseRevenueWidget";
import type { FranchisePayment } from "@/app/franchise/payments/actions";

import { useMemo, useState } from "react";
import { inPeriod, type Period } from "@/lib/dashboard";
import type { OpenTask } from "@/lib/tasks";
import {
  computeFranchiseFunnel,
  computeFranchiseSourceBreakdown,
  computeNetworkSummary,
  computeNetworkStructure,
  computeApproxGeography,
  computeRecentActivity,
  countStageTransitionsInPeriod,
  latestActivityByCandidate,
  findStaleFranchiseCandidates,
  franchiseMonthsWithActivity,
  franchiseYearsWithActivity,
  monthlyFranchiseSubmissions,
  weeklyFranchiseCandidates,
  type InterviewStats,
} from "@/lib/franchiseDashboard";
import type { FranchiseCandidate } from "./types";
import FranchiseDashboard from "./FranchiseDashboard";

type StageHistoryRow = { candidate_id: string; stage: string; occurred_at: string };

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Owns the bits of state Главная's franchise view needs (the month/year
 * period, same idea as FranchiseBoard used to when the dashboard briefly
 * lived on /franchise — see that file's history) and derives everything
 * FranchiseDashboard renders from the `candidates` array already fetched
 * server-side in src/app/page.tsx. `qualifiedIds` and `interviewStats`
 * come from server-side queries against franchise_stage_history that this
 * component has no reason to duplicate (see page.tsx) — everything else
 * here is a plain client-side computation, so switching period or tab is
 * instant and has nothing left to silently fail the way the old
 * `?scope=franchise` query param did.
 */
export default function FranchiseHomeDashboard({
  candidates,
  qualifiedIds,
  interviewStats,
  tasks,
  canEditTasks,
  stageHistory,
  payments,
}: {
  candidates: FranchiseCandidate[];
  qualifiedIds: string[];
  interviewStats: InterviewStats;
  /** Round 44 — open tasks left on franchise candidates' cards, same
   * OpenTask shape the club Главная's "Мои задачи" widget uses. */
  tasks: OpenTask[];
  canEditTasks: boolean;
  /** Round 46 — full franchise_stage_history (candidate_id/stage/
   * occurred_at), fetched once in page.tsx. Powers the «Дашборд партнёров»
   * block's "last activity" timestamp per candidate (candidates.updated_at
   * itself turned out to be a mass-backfill artifact, useless for this —
   * see latestActivityByCandidate) and, since round 46 part 2, the
   * period-scoped "Договор отправлен" tile (countStageTransitionsInPeriod). */
  stageHistory: StageHistoryRow[];
  /** Round 50 — franchise invoices for the revenue widget; null when the
   * viewer has no franchise-billing visibility. */
  payments?: FranchisePayment[] | null;
}) {
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });
  const qualifiedIdSet = useMemo(() => new Set(qualifiedIds), [qualifiedIds]);

  // «Дашборд партнёров» (round 46) — runs on ALL candidates, all stages
  // (Anastasiia's own words on the follow-up round: "всего заявок на всех
  // стадиях", "структура сети — учитывая все стадии"). An earlier version
  // scoped this to PARTNER_STAGES (interview_done+); that scoping was
  // removed after this feedback rather than left dangling unused.
  const lastActivityById = useMemo(() => latestActivityByCandidate(stageHistory), [stageHistory]);
  const networkSummary = useMemo(() => computeNetworkSummary(candidates), [candidates]);
  const networkStructure = useMemo(() => computeNetworkStructure(candidates), [candidates]);
  const networkGeography = useMemo(() => computeApproxGeography(candidates), [candidates]);
  const recentActivity = useMemo(
    () => computeRecentActivity(candidates, lastActivityById),
    [candidates, lastActivityById]
  );

  const inPeriodCandidates = useMemo(
    () => candidates.filter((c) => inPeriod(period, c.submitted_at)),
    [candidates, period]
  );

  // "виджет новых за неделю заявок... воронку тоже за неделю" (round 42) —
  // a fixed rolling 7 days, independent of the month/year period above.
  const weeklyCandidates = useMemo(() => weeklyFranchiseCandidates(candidates), [candidates]);
  const weeklyFunnel = useMemo(() => computeFranchiseFunnel(weeklyCandidates), [weeklyCandidates]);

  // "пусть пишется города еще откуда заявки" (Anastasiia, 5 окт 2026) —
  // distinct target_city values among this week's candidates, shown under
  // the "Заявок за неделю" tile. Raw free text, same as elsewhere on this
  // dashboard (see computeRecentActivity) — no geo-normalisation here.
  const weeklyCities = useMemo(() => {
    const seen = new Set<string>();
    for (const c of weeklyCandidates) {
      const city = c.target_city?.trim();
      if (city) seen.add(city);
    }
    return [...seen];
  }, [weeklyCandidates]);

  // "Добавь договор отправлен за неделю/ за выбранный период" (round 46
  // part 2) — same month/year/range period as submittedCount below, applied
  // to stage-history transitions instead of submission dates (see
  // countStageTransitionsInPeriod for why history, not current stage).
  const contractSentCount = useMemo(
    () => countStageTransitionsInPeriod(stageHistory, "contract_sent", period),
    [stageHistory, period]
  );

  // "как считается КВАЛИФИЦИРОВАННЫХ 23? за какой период? сделай за
  // выбранный и за неделю" (round 46 part 5) — qualifiedIdSet itself is
  // all-time (see page.tsx/computeQualifiedIds), so it never answered "for
  // what period". Scoped here the same way "Заявок франчайзи"/"Заявок за
  // неделю" already are — by submitted_at, not by when the qualifying stage
  // was reached — so it reads as "of who APPLIED in this period/week, how
  // many turned out qualified".
  const qualifiedInPeriodCount = useMemo(
    () => inPeriodCandidates.filter((c) => qualifiedIdSet.has(c.id)).length,
    [inPeriodCandidates, qualifiedIdSet]
  );
  const qualifiedWeeklyCount = useMemo(
    () => weeklyCandidates.filter((c) => qualifiedIdSet.has(c.id)).length,
    [weeklyCandidates, qualifiedIdSet]
  );

  return (
    <FranchiseDashboard
      period={period}
      onSelectPeriod={setPeriod}
      monthOptions={franchiseMonthsWithActivity(candidates)}
      yearOptions={franchiseYearsWithActivity(candidates)}
      submittedCount={inPeriodCandidates.length}
      weeklyCount={weeklyCandidates.length}
      weeklyCities={weeklyCities}
      qualifiedCount={qualifiedInPeriodCount}
      qualifiedWeeklyCount={qualifiedWeeklyCount}
      contractSentCount={contractSentCount}
      submissionTrend={monthlyFranchiseSubmissions(candidates)}
      funnel={computeFranchiseFunnel(candidates)}
      weeklyFunnel={weeklyFunnel}
      interviewStats={interviewStats}
      sourceBreakdown={computeFranchiseSourceBreakdown(inPeriodCandidates)}
      staleCandidates={findStaleFranchiseCandidates(candidates)}
      tasks={tasks}
      canEditTasks={canEditTasks}
      networkSummary={networkSummary}
      networkStructure={networkStructure}
      networkGeography={networkGeography}
      recentActivity={recentActivity}
      revenueSlot={
        // Round 50: «Доходы от франчайзи» — follows the same period switcher.
        payments ? <FranchiseRevenueWidget payments={payments} period={period} /> : null
      }
    />
  );
}
