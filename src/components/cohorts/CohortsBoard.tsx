"use client";

import { monthLabel } from "@/lib/dashboard";
import { sourceLabel, interpolateHex, SOURCES } from "@/lib/leads";
import type { Locale } from "@/lib/i18n";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { CohortReport } from "@/lib/cohorts";

/** Same red family as the funnel/source-donut gradients elsewhere (round
 * 23/26) — a cohort heatmap cell's shade is just how much of that cohort's
 * own peak month it represents, painted with the app's own accent colors
 * instead of an unrelated green/blue heat scale. */
function heatColor(value: number, rowMax: number): string | undefined {
  if (value <= 0 || rowMax <= 0) return undefined;
  const t = Math.min(1, value / rowMax);
  return interpolateHex("#fbeaec", "#9e0c24", t);
}

function cohortLabel(campaignKey: string | null, isCampaign: boolean, locale: Locale, noSourceText: string): string {
  if (!campaignKey) return noSourceText;
  if (isCampaign) return campaignKey;
  return (SOURCES as readonly string[]).includes(campaignKey) ? sourceLabel(campaignKey, locale) : campaignKey;
}

export default function CohortsBoard({ report }: { report: CohortReport }) {
  const { locale, t } = useLocale();

  if (report.rows.length === 0) {
    return <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">{t("cohortEmpty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted">{t("cohortHint")}</p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="whitespace-nowrap px-3 py-2">{t("cohortColPeriod")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("cohortColSource")}</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">{t("cohortColContacts")}</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">{t("cohortColPaid")}</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">{t("cohortColConversion")}</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">{t("cohortColRevenue")}</th>
              {Array.from({ length: report.horizonMonths }, (_, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-2 text-right">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const rowMax = Math.max(0, ...row.monthly);
              return (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{monthLabel(row.month, locale)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {cohortLabel(row.campaignKey, row.isCampaign, locale, t("cohortNoSource"))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ink-2">{row.contactsCount}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ink-2">{row.paidContactsCount}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ink-2">{row.conversionPct}%</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-ink-2">
                    <Money amountEur={row.totalRevenue} />
                  </td>
                  {row.monthly.map((value, i) => (
                    <td
                      key={i}
                      className="whitespace-nowrap px-2 py-2 text-right text-ink-2"
                      style={{ background: heatColor(value, rowMax) }}
                    >
                      {value > 0 ? <Money amountEur={value} /> : <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
