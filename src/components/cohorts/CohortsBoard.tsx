"use client";

import { useMemo, useState } from "react";
import { currentMonthKey, monthKeyOf, monthLabel } from "@/lib/dashboard";
import { sourceLabel, sourceColor, interpolateHex, SOURCES } from "@/lib/leads";
import type { Locale } from "@/lib/i18n";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MultiSelectFilter, { type MultiSelectOption } from "@/components/leads/MultiSelectFilter";
import { computeCohortReport, type CohortContactInput, type CohortPaymentInput, type CohortRow } from "@/lib/cohorts";

/** Same red family as the funnel's own gradient ("Воронка лидов за период",
 * DashboardBoard.tsx) — Anastasiia asked explicitly for this exact palette
 * here too ("Используй такие цвета... для источников лидов" carried over to
 * round 28's cohort heatmap: "Цвета возьми градиента красного как тут
 * (стадии воронок)"), so this reuses the funnel's literal from/to hex
 * instead of a separately-tuned pair. */
const HEAT_FROM = "#e2515f";
const HEAT_TO = "#7a0c1f";

function heatColor(value: number, rowMax: number): string | undefined {
  if (value <= 0 || rowMax <= 0) return undefined;
  const t = Math.min(1, value / rowMax);
  return interpolateHex(HEAT_FROM, HEAT_TO, t);
}

function cohortLabel(campaignKey: string | null, isCampaign: boolean, locale: Locale, noSourceText: string): string {
  if (!campaignKey) return noSourceText;
  if (isCampaign) return campaignKey;
  return (SOURCES as readonly string[]).includes(campaignKey) ? sourceLabel(campaignKey, locale) : campaignKey;
}

// Round 28 (16 сен 2026) — Anastasiia: "Периоды как в срм" — a local,
// client-only equivalent of the Dashboard's month/year/custom-range period
// picker (src/components/dashboard/DashboardBoard.tsx's PeriodFilter). It
// doesn't reuse that component directly because it filters entirely
// client-side (no page navigation/URL — same interaction model as the
// Leads board's own filters) and, unlike the dashboard, cohort analysis
// wants an explicit "все время" state as the default rather than always
// pinning to one calendar month.
type CohortPeriod =
  | { mode: "all" }
  | { mode: "month"; month: string }
  | { mode: "year"; year: string }
  | { mode: "range"; from: string; to: string };

function monthMatchesPeriod(monthKey: string, period: CohortPeriod): boolean {
  if (period.mode === "all") return true;
  if (period.mode === "month") return monthKey === period.month;
  if (period.mode === "year") return monthKey.slice(0, 4) === period.year;
  return monthKey >= period.from.slice(0, 7) && monthKey <= period.to.slice(0, 7);
}

function CohortPeriodFilter({
  period,
  onChange,
  monthOptions,
  yearOptions,
}: {
  period: CohortPeriod;
  onChange: (next: CohortPeriod) => void;
  monthOptions: string[];
  yearOptions: string[];
}) {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<"month" | "year">(period.mode === "year" ? "year" : "month");
  const [rangeFrom, setRangeFrom] = useState(period.mode === "range" ? period.from : "");
  const [rangeTo, setRangeTo] = useState(period.mode === "range" ? period.to : "");
  const tabOptions = tab === "month" ? monthOptions : yearOptions;

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
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
        <button
          type="button"
          onClick={() => onChange({ mode: "all" })}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            period.mode === "all"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-ink-2 hover:bg-surface-2"
          }`}
        >
          {t("cohortAllTime")}
        </button>
        {tabOptions.map((key) => {
          const isActive = tab === "month" ? period.mode === "month" && period.month === key : period.mode === "year" && period.year === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(tab === "month" ? { mode: "month", month: key } : { mode: "year", year: key })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive ? "border-foreground bg-foreground text-background" : "border-border text-ink-2 hover:bg-surface-2"
              }`}
            >
              {tab === "month" ? monthLabel(key, locale) : key}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted">
          {t("fieldFrom")}
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          {t("fieldTo")}
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={!rangeFrom || !rangeTo}
          onClick={() => onChange({ mode: "range", from: rangeFrom, to: rangeTo })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("btnShowPeriod")}
        </button>
        {period.mode === "range" && (
          <button
            type="button"
            onClick={() => {
              setRangeFrom("");
              setRangeTo("");
              onChange({ mode: "all" });
            }}
            className="px-1 py-1.5 text-sm text-muted hover:text-ink-2"
          >
            {t("linkResetToMonths")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CohortsBoard({
  contacts,
  payments,
}: {
  contacts: CohortContactInput[];
  payments: CohortPaymentInput[];
}) {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<CohortPeriod>({ mode: "all" });
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set());

  // Round 28: "Нужно выбирать компанию и источников" — source and campaign
  // are independent facets on a CONTACT's own first touch, so filtering has
  // to happen on the raw contacts before bucketing into cohorts, not on the
  // already-collapsed cohort rows (a row is keyed on campaign OR source,
  // whichever was known — see cohortCampaignKey in lib/cohorts.ts — so
  // filtering rows directly would make a source filter blind to every
  // campaign-keyed cohort and vice versa).
  const customSourceValues = useMemo(
    () =>
      Array.from(
        new Set(
          contacts.map((c) => c.firstSource).filter((s): s is string => !!s && !(SOURCES as readonly string[]).includes(s))
        )
      ).sort(),
    [contacts]
  );
  const sourceOptions: MultiSelectOption[] = useMemo(
    () => [
      ...SOURCES.map((s) => ({ value: s, label: sourceLabel(s, locale) })),
      ...customSourceValues.map((v) => ({ value: v, label: v })),
    ],
    [locale, customSourceValues]
  );
  const campaignOptions: MultiSelectOption[] = useMemo(
    () =>
      Array.from(new Set(contacts.map((c) => c.firstUtmCampaign).filter((c): c is string => !!c)))
        .sort()
        .map((c) => ({ value: c, label: c })),
    [contacts]
  );

  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentMonthKey()]);
    contacts.forEach((c) => set.add(monthKeyOf(c.createdAt)));
    return [...set].sort().reverse().slice(0, 6);
  }, [contacts]);
  const yearOptions = useMemo(() => {
    const set = new Set<string>([currentMonthKey().slice(0, 4)]);
    contacts.forEach((c) => set.add(monthKeyOf(c.createdAt).slice(0, 4)));
    return [...set].sort().reverse();
  }, [contacts]);

  const report = useMemo(() => {
    const filteredContacts = contacts.filter((c) => {
      if (sources.size > 0 && (!c.firstSource || !sources.has(c.firstSource))) return false;
      if (campaigns.size > 0 && (!c.firstUtmCampaign || !campaigns.has(c.firstUtmCampaign))) return false;
      if (!monthMatchesPeriod(monthKeyOf(c.createdAt), period)) return false;
      return true;
    });
    return computeCohortReport(filteredContacts, payments);
  }, [contacts, payments, sources, campaigns, period]);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted">{t("cohortHint")}</p>

      <CohortPeriodFilter period={period} onChange={setPeriod} monthOptions={monthOptions} yearOptions={yearOptions} />

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter allLabel={t("allSources")} options={sourceOptions} selected={sources} onChange={setSources} />
        {campaignOptions.length > 0 && (
          <MultiSelectFilter allLabel={t("allCampaigns")} options={campaignOptions} selected={campaigns} onChange={setCampaigns} />
        )}
      </div>

      {report.rows.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">{t("cohortEmpty")}</p>
      ) : (
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
                {report.columns.map((col) => (
                  <th key={col} className="whitespace-nowrap px-2 py-2 text-right">
                    {monthLabel(col, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row: CohortRow) => {
                const rowMax = Math.max(0, ...row.monthly);
                return (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{monthLabel(row.month, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: row.campaignKey && !row.isCampaign ? sourceColor(row.campaignKey) : undefined }}
                      />
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
      )}
    </div>
  );
}
