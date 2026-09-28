"use client";

import { useMemo, useState } from "react";
import { inPeriod, type Period } from "@/lib/dashboard";
import {
  computeFranchiseFunnel,
  computeFranchiseSourceBreakdown,
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
}: {
  candidates: FranchiseCandidate[];
  qualifiedIds: string[];
  interviewStats: InterviewStats;
}) {
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });
  const qualifiedIdSet = useMemo(() => new Set(qualifiedIds), [qualifiedIds]);

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
    />
  );
}
