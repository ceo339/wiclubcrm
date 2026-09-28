"use client";

import Link from "next/link";
import { useState } from "react";
import { monthLabel, periodLabel, type Period } from "@/lib/dashboard";
import {
  franchiseStageLabel,
  type FranchiseFunnelStage,
  type FranchiseSourceBreakdown,
  type MonthlyCount,
  type StaleFranchiseCandidate,
} from "@/lib/franchiseDashboard";
import { interpolateHex } from "@/lib/leads";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Sparkline from "@/components/dashboard/Sparkline";

/**
 * "Главную сделать с той же аналитикой, что и для клубов" (Anastasiia, 28
 * сен 2026) — same visual language as DashboardBoard (stat tiles, funnel
 * bars, a source table, a stale-cards panel), rebuilt against
 * franchise_candidates instead of leads/members/payments. No revenue/
 * royalty tiles here — a franchise candidate isn't a payment, so those
 * club-only numbers have no honest equivalent to show.
 */
export default function FranchiseDashboard({
  period,
  monthOptions,
  yearOptions,
  submittedCount,
  qualifiedCount,
  activeCount,
  conversion,
  submissionTrend,
  funnel,
  sourceBreakdown,
  staleCandidates,
}: {
  period: Period;
  monthOptions: string[];
  yearOptions: string[];
  submittedCount: number;
  qualifiedCount: number;
  activeCount: number;
  conversion: number | null;
  submissionTrend: MonthlyCount[];
  funnel: FranchiseFunnelStage[];
  sourceBreakdown: FranchiseSourceBreakdown[];
  staleCandidates: StaleFranchiseCandidate[];
}) {
  const { locale, t } = useLocale();
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const maxSource = Math.max(1, ...sourceBreakdown.map((s) => s.count));
  const [tab, setTab] = useState<"month" | "year">(period.mode === "year" ? "year" : "month");
  const tabOptions = tab === "month" ? monthOptions : yearOptions;

  return (
    <div className="flex flex-1 flex-col gap-4">
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
              <Link
                key={key}
                href={tab === "month" ? `/?scope=franchise&month=${key}` : `/?scope=franchise&year=${key}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-ink-2 hover:bg-surface-2"
                }`}
              >
                {tab === "month" ? monthLabel(key, locale) : key}
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{periodLabel(period, locale)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-4 shadow-card">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statFranchiseSubmitted")}</div>
          <div
            className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {submittedCount}
          </div>
          <div className="mt-1 text-xs text-muted">{t("deltaForPeriod")}</div>
          <Sparkline values={submissionTrend.map((m) => m.value)} color="#7a0c1f" />
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-card">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statFranchiseQualified")}</div>
          <div
            className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {qualifiedCount}
          </div>
          <div className="mt-1 text-xs text-muted">{t("dash")}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-card">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statFranchiseActive")}</div>
          <div
            className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {activeCount}
          </div>
          <div className="mt-1 text-xs text-muted">{t("dash")}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-card">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statFranchiseConversion")}</div>
          <div
            className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {conversion === null ? t("dash") : `${conversion}%`}
          </div>
          <div className="mt-1 text-xs text-muted">{t("dash")}</div>
        </div>
      </div>

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
        <div className="border-t border-border px-5 py-3">
          <Link href="/franchise" className="text-sm text-muted hover:text-ink-2 hover:underline">
            {t("linkViewAllFranchise")} →
          </Link>
        </div>
      </div>
    </div>
  );
}
