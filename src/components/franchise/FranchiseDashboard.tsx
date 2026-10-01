"use client";

import type React from "react";

import { useState } from "react";
import { monthLabel, periodLabel, type Period } from "@/lib/dashboard";
import type { OpenTask } from "@/lib/tasks";
import {
  franchiseStageLabel,
  type FranchiseFunnelStage,
  type FranchiseSourceBreakdown,
  type InterviewStats,
  type MonthlyCount,
  type StaleFranchiseCandidate,
} from "@/lib/franchiseDashboard";
import { interpolateHex } from "@/lib/leads";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Sparkline from "@/components/dashboard/Sparkline";
import TasksWidget from "@/components/home/TasksWidget";
import NetworkSummaryPanel, { RecentActivityCard, StatTile } from "./NetworkSummaryPanel";
import type { NetworkSummary, NetworkStructure, ApproxGeography, RecentActivityItem } from "@/lib/franchiseDashboard";

// «Сделай нижние виджеты визуально как верхние» (Anastasiia, round 46) —
// один и тот же брендовый цвет для всех шести плиток ниже: в отличие от
// «Структуры сети» это не категориальный набор, которому нужны разные
// цвета для различения, просто общий визуальный язык с новым блоком выше.
const FUNNEL_TILE_COLOR = "#9e0c24";

/**
 * "Главную сделать с той же аналитикой, что и для клубов" (Anastasiia, 28
 * сен 2026) — same visual language as DashboardBoard (stat tiles, funnel
 * bars, a source table, a stale-cards panel), rebuilt against
 * franchise_candidates instead of leads/members/payments. No revenue/
 * royalty tiles here — a franchise candidate isn't a payment, so those
 * club-only numbers have no honest equivalent to show.
 *
 * Round 40 follow-up: this originally lived on Главная behind a
 * `?scope=franchise` query param, driven by `<Link>`s for the month/year
 * switcher. That query param reproducibly failed to render in production
 * for reasons that resisted every fix tried (force-dynamic, ruling out
 * every cache layer), so it briefly moved to an "Аналитика" tab on
 * /franchise instead, with the period switcher driven by a plain callback
 * into the parent's own React state rather than a URL.
 *
 * Round 42 (28 сен 2026): moved again, this time to Главная itself as the
 * default view for hq/viewer accounts ("по умолчанию главная — это
 * франчайзи", see FranchiseHomeDashboard.tsx, the new parent that owns
 * `period`). Also gained three new pieces: a fixed rolling-7-day "new this
 * week" count, a funnel scoped to just that week's cohort ("воронку тоже
 * за неделю, сколько из новых на каком этапе"), and how many candidates
 * have ever had their interview marked done, this week and all time.
 */
export default function FranchiseDashboard({
  period,
  revenueSlot,
  monthOptions,
  yearOptions,
  onSelectPeriod,
  submittedCount,
  weeklyCount,
  qualifiedCount,
  qualifiedWeeklyCount,
  contractSentCount,
  submissionTrend,
  funnel,
  weeklyFunnel,
  interviewStats,
  sourceBreakdown,
  staleCandidates,
  tasks,
  canEditTasks,
  networkSummary,
  networkStructure,
  networkGeography,
  recentActivity,
}: {
  period: Period;
  /** Round 50 — «Доходы от франчайзи», rendered right under the KPI tiles. */
  revenueSlot?: React.ReactNode;
  monthOptions: string[];
  yearOptions: string[];
  onSelectPeriod: (period: Period) => void;
  submittedCount: number;
  /** New candidates submitted in the last rolling 7 days — always "this
   * week", independent of the month/year selector above. */
  weeklyCount: number;
  /** Round 46 part 5 ("как считается КВАЛИФИЦИРОВАННЫХ 23? за какой период?
   * сделай за выбранный и за неделю") — scoped by submitted_at, same
   * population as submittedCount above (of who applied in this period, how
   * many are qualified), not by when the qualifying stage was reached. */
  qualifiedCount: number;
  /** Same scoping as qualifiedCount, but the fixed rolling 7 days instead of
   * the month/year/range selector — rendered as this tile's secondary line,
   * same pattern as statInterviewsAllTime below. */
  qualifiedWeeklyCount: number;
  /** Round 46 part 2 ("Добавь договор отправлен за неделю/ за выбранный
   * период") — count of stage-history transitions onto "contract_sent"
   * within the selected month/year/range period (see
   * countStageTransitionsInPeriod). "Активных франшиз" and "Заявка →
   * Активна" used to live in this same row; both moved/removed this round
   * (see NetworkSummaryPanel's top row and computeNetworkSummary). */
  contractSentCount: number;
  submissionTrend: MonthlyCount[];
  funnel: FranchiseFunnelStage[];
  /** Same shape/logic as `funnel`, computed against just the candidates
   * submitted in the last 7 days. */
  weeklyFunnel: FranchiseFunnelStage[];
  interviewStats: InterviewStats;
  sourceBreakdown: FranchiseSourceBreakdown[];
  staleCandidates: StaleFranchiseCandidate[];
  /** Round 44 ("Добавь задачи... на главную") — open tasks left on
   * candidates' cards, rendered the same way the club Главная's own "Мои
   * задачи" widget does. */
  tasks: OpenTask[];
  canEditTasks: boolean;
  /** Round 46 — «Дашборд партнёров», новый блок вверху (см.
   * NetworkSummaryPanel.tsx для скоупа/логики). */
  networkSummary: NetworkSummary;
  networkStructure: NetworkStructure;
  networkGeography: ApproxGeography;
  recentActivity: RecentActivityItem[];
}) {
  const { locale, t } = useLocale();
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const maxWeeklyFunnel = Math.max(1, ...weeklyFunnel.map((s) => s.count));
  const maxSource = Math.max(1, ...sourceBreakdown.map((s) => s.count));
  const [tab, setTab] = useState<"month" | "year">(period.mode === "year" ? "year" : "month");
  const tabOptions = tab === "month" ? monthOptions : yearOptions;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NetworkSummaryPanel
        summary={networkSummary}
        structure={networkStructure}
        geography={networkGeography}
      />

      <div className="rounded-xl border border-border bg-background shadow-card p-4">
        <div className="mb-2 inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          {(["month", "year"] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === tb ? "bg-surface-2 text-foreground" : "text-muted hover:text-ink-2"
              }`}
            >
              {t(tb === "month" ? "periodTabMonths" : "periodTabYear")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabOptions.map((key) => {
            const isActive =
              tab === "month" ? period.mode === "month" && period.month === key : period.mode === "year" && period.year === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPeriod(tab === "month" ? { mode: "month", month: key } : { mode: "year", year: key })}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-ink-2 hover:bg-surface-2"
                }`}
              >
                {tab === "month" ? monthLabel(key, locale) : key}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{periodLabel(period, locale)}</p>
      </div>

      {/* Tasks and «Недавняя активность» side by side (1 Oct 2026). */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <TasksWidget tasks={tasks} headingKey="headingFranchiseTasks" canEdit={canEditTasks} />
        <RecentActivityCard recentActivity={recentActivity} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label={t("statFranchiseSubmitted")}
          value={submittedCount}
          caption={t("deltaForPeriod")}
          borderColor={FUNNEL_TILE_COLOR}
        >
          <Sparkline values={submissionTrend.map((m) => m.value)} color="#7a0c1f" />
        </StatTile>
        <StatTile
          label={t("statFranchiseWeeklyNew")}
          value={weeklyCount}
          caption={t("last7Days")}
          borderColor={FUNNEL_TILE_COLOR}
        />
        <StatTile
          label={t("statFranchiseQualified")}
          value={qualifiedCount}
          caption={t("deltaForPeriod")}
          borderColor={FUNNEL_TILE_COLOR}
        >
          <div className="text-xs text-muted">{t("statQualifiedWeekly", { n: qualifiedWeeklyCount })}</div>
        </StatTile>
        <StatTile
          label={t("fStageContractSent")}
          value={contractSentCount}
          caption={t("deltaForPeriod")}
          borderColor={FUNNEL_TILE_COLOR}
        />
        <StatTile
          label={t("statFranchiseInterviewsDone")}
          value={interviewStats.week}
          caption={t("perWeek")}
          borderColor={FUNNEL_TILE_COLOR}
        >
          <div className="text-xs text-muted">{t("statInterviewsAllTime", { n: interviewStats.allTime })}</div>
        </StatTile>
      </div>

      {revenueSlot}

      <div className="rounded-xl border border-border bg-background shadow-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("headingFranchiseFunnel")}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {funnel.map((s, i) => {
            const widthPct = Math.max(8, (s.count / maxFunnel) * 100);
            const stageColor = interpolateHex("#e2515f", "#7a0c1f", funnel.length > 1 ? i / (funnel.length - 1) : 0);
            return (
              <div key={s.id} className="grid grid-cols-[160px_1fr_112px] items-center gap-3 sm:grid-cols-[200px_1fr_120px]">
                <div className="truncate text-sm text-ink-2">{franchiseStageLabel(s.id, locale)}</div>
                <div
                  className="flex h-[30px] min-w-[40px] items-center rounded-lg px-2.5 text-[13px] font-bold text-white transition-[width]"
                  style={{ width: `${widthPct}%`, background: stageColor, fontVariantNumeric: "tabular-nums" }}
                >
                  {s.count}
                </div>
                <div className="text-right text-xs text-muted">
                  {i === 0
                    ? t("funnelStart")
                    : s.pctFromFirst === null
                      ? t("dash")
                      : t("funnelPctOfNew", { percent: s.pctFromFirst })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("headingFranchiseWeeklyFunnel")}</h2>
        {weeklyFunnel.length === 0 || weeklyFunnel[0].count === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("emptyNoNewFranchiseCandidatesWeek")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {weeklyFunnel.map((s, i) => {
              const widthPct = Math.max(8, (s.count / maxWeeklyFunnel) * 100);
              const stageColor = interpolateHex(
                "#e2515f",
                "#7a0c1f",
                weeklyFunnel.length > 1 ? i / (weeklyFunnel.length - 1) : 0
              );
              return (
                <div key={s.id} className="grid grid-cols-[160px_1fr_112px] items-center gap-3 sm:grid-cols-[200px_1fr_120px]">
                  <div className="truncate text-sm text-ink-2">{franchiseStageLabel(s.id, locale)}</div>
                  <div
                    className="flex h-[30px] min-w-[40px] items-center rounded-lg px-2.5 text-[13px] font-bold text-white transition-[width]"
                    style={{ width: `${widthPct}%`, background: stageColor, fontVariantNumeric: "tabular-nums" }}
                  >
                    {s.count}
                  </div>
                  <div className="text-right text-xs text-muted">
                    {i === 0
                      ? t("funnelStart")
                      : s.pctFromFirst === null
                        ? t("dash")
                        : t("funnelPctOfNew", { percent: s.pctFromFirst })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("headingFranchiseSourceBreakdown")}</h2>
          {sourceBreakdown.length > 0 && (
            <span className="text-xs text-muted">
              {t("colFranchiseCandidates")} · {t("colPctActive")}
            </span>
          )}
        </div>
        {sourceBreakdown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("emptyNoFranchiseCandidatesPeriod")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {sourceBreakdown.map((r) => (
              <div key={r.source || "—"} className="flex items-center gap-3">
                <div className="w-28 shrink-0 truncate text-sm text-ink-2">{r.source || t("dash")}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (r.count / maxSource) * 100)}%` }}
                  />
                </div>
                <div className="w-10 shrink-0 text-right text-sm font-medium text-ink-2">{r.count}</div>
                <div className="w-14 shrink-0 text-right text-xs text-muted">
                  {r.pctActive === null ? t("dash") : `${r.pctActive}%`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t("headingStaleFranchiseCandidates")}</h2>
        </div>
        {staleCandidates.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("emptyNoStaleFranchiseCandidates")}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("colCandidate")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("colStage")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("colDaysStuck")}</th>
                </tr>
              </thead>
              <tbody>
                {staleCandidates.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-2.5 text-muted">{franchiseStageLabel(c.stage, locale)}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-accent-strong">
                      {t("daysCount", { n: c.daysSinceUpdate })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
