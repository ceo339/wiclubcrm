"use client";

import { useMemo, useState } from "react";
import { inPeriod, type Period } from "@/lib/dashboard";
import type { OpenTask } from "@/lib/tasks";
import { PARTNER_STAGES, computeStageReachedIds } from "@/lib/franchise";
import {
  computeFranchiseFunnel,
  computeFranchiseSourceBreakdown,
  computeNetworkSummary,
  computeNetworkStructure,
  computeApproxGeography,
  computeRecentActivity,
  latestActivityByCandidate,
  findStaleFranchiseCandidates,
  franchiseConversionRate,
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
}: {
  candidates: FranchiseCandidate[];
  qualifiedIds: string[];
  interviewStats: InterviewStats;
  /** Round 44 — open tasks left on franchise candidates' cards, same
   * OpenTask shape the club Главная's "Мои задачи" widget uses. */
  tasks: OpenTask[];
  canEditTasks: boolean;
  /** Round 46 — full franchise_stage_history (candidate_id/stage/
   * occurred_at), fetched once in page.tsx. Powers the new «Дашборд
   * партнёров» block: which candidates count as partner-track
   * (PARTNER_STAGES, by history same as qualifiedIds above) and the real
   * "last activity" timestamp per candidate (candidates.updated_at itself
   * turned out to be useless for this — see latestActivityByCandidate). */
  stageHistory: StageHistoryRow[];
}) {
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });
  const qualifiedIdSet = useMemo(() => new Set(qualifiedIds), [qualifiedIds]);

  // «Но начиная со стадии интервью пройдено» (round 46) — the network
  // summary panel only makes sense for candidates who are genuinely
  // partner-track, not every raw application.
  const partnerIds = useMemo(
    () =>
      computeStageReachedIds(
        candidates,
        PARTNER_STAGES,
        stageHistory.filter((h) => PARTNER_STAGES.includes(h.stage as (typeof PARTNER_STAGES)[number])).map((h) => h.candidate_id)
      ),
    [candidates, stageHistory]
  );
  const partnerIdSet = useMemo(() => new Set(partnerIds), [partnerIds]);
  const partnerCandidates = useMemo(() => candidates.filter((c) => partnerIdSet.has(c.id)), [candidates, partnerIdSet]);
  const lastActivityById = useMemo(() => latestActivityByCandidate(stageHistory), [stageHistory]);
  const networkSummary = useMemo(() => computeNetworkSummary(partnerCandidates), [partnerCandidates]);
  const networkStructure = useMemo(() => computeNetworkStructure(partnerCandidates), [partnerCandidates]);
  const networkGeography = useMemo(() => computeApproxGeography(partnerCandidates), [partnerCandidates]);
  const recentActivity = useMemo(
    () => computeRecentActivity(partnerCandidates, lastActivityById),
    [partnerCandidates, lastActivityById]
  );

  const inPeriodCandidates = useMemo(
    () => candidates.filter((c) => inPeriod(period, c.submitted_at)),
    [candidates, period]
  );

  // "виджет новых за неделю заявок... воронку тоже за неделю" (round 42) —
  // a fixed rolling 7 days, independent of the month/year period above.
  const weeklyCandidates = useMemo(() => weeklyFranchiseCandidates(candidates), [candidates]);
  const weeklyFunnel = useMemo(() => computeFranchiseFunnel(weeklyCandidates), [weeklyCandidates]);

  return (
    <FranchiseDashboard
      period={period}
      onSelectPeriod={setPeriod}
      monthOptions={franchiseMonthsWithActivity(candidates)}
      yearOptions={franchiseYearsWithActivity(candidates)}
      submittedCount={inPeriodCandidates.length}
      weeklyCount={weeklyCandidates.length}
      qualifiedCount={qualifiedIdSet.size}
      activeCount={candidates.filter((c) => c.stage === "active").length}
      conversion={franchiseConversionRate(candidates)}
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
    />
  );
}
