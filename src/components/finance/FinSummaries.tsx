"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { monthLabel } from "@/lib/dashboard";
import { scale, type Amt } from "@/lib/finance/amt";
import type { InvestmentSummary, WorkshopLine } from "@/lib/finance/report";
import { A } from "./A";

function Kpi({ label, value, hint, bad }: { label: string; value: React.ReactNode; hint?: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 font-display text-[24px] leading-[1.1] tracking-[-0.02em] ${bad ? "text-accent-strong" : "text-foreground"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Round 112: итоги Workshop и тренингов за период — по каждому продукту доход, расходы, прибыль. */
export function WorkshopSummary({ lines, revenue, expenses, profit }: { lines: WorkshopLine[]; revenue: Amt; expenses: Amt; profit: Amt }) {
  const { t } = useLocale();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label={t("finWsRevenue")} value={<A v={revenue} />} />
        <Kpi label={t("finWsExpensesKpi")} value={<A v={expenses} />} />
        <Kpi label={t("finWsProfit")} value={<A v={profit} />} bad={profit.eur < 0} />
      </div>
      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 text-left font-medium">{t("finFieldProduct")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("finWsRevenue")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("finWsExpensesKpi")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("finWsProfit")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {l.name}
                    <div className="text-[11px] text-muted">{t("finWsPaid", { n: l.paid })}</div>
                  </td>
                  <td className="px-3 py-2 text-right"><A v={l.revenue} /></td>
                  <td className="px-3 py-2 text-right"><A v={l.expenses} /></td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.profit.eur < 0 ? "text-accent-strong" : ""}`}><A v={l.profit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-background p-4 text-sm text-muted shadow-card">{t("finWsNoProducts")}</p>
      )}
    </div>
  );
}

/** Round 112: сколько вложено и сколько клуб уже вернул из денежного потока. */
export function InvestmentSummaryView({ s }: { s: InvestmentSummary }) {
  const { locale, t } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Kpi label={t("finInvTotal")} value={<A v={s.invested} />} hint={s.fromMonth ? t("finInvFrom", { m: monthLabel(s.fromMonth, locale) }) : undefined} />
      <Kpi label={t("finInvEarned")} value={<A v={s.earned} />} bad={s.earned.eur < 0} hint={t("finInvEarnedHint")} />
      <Kpi
        label={s.paidBack ? t("finInvPaidBack") : t("finInvLeft")}
        value={<A v={s.paidBack ? scale(s.left, -1) : s.left} />}
        bad={!s.paidBack && s.invested.eur > 0}
        hint={s.invested.eur > 0 ? t("finInvPct", { p: Math.max(0, Math.round((s.earned.eur / s.invested.eur) * 100)) }) : t("finInvNone")}
      />
    </div>
  );
}
