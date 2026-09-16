"use client";

// Round 28 (Когорты) introduced a client-only, no-page-reload period picker
// (month / year / custom range / explicit "все время") as a local
// alternative to the Dashboard's own server-driven PeriodFilter (which
// works through the URL and a full page navigation). Round 28, часть D —
// "в лиды нужно добавить выбор фильтр периодов" (Anastasiia) — asked for the
// exact same picker on the Leads board, so it's extracted here rather than
// copy-pasted a second time: both boards filter entirely client-side over
// data they already have in memory, same interaction model as their other
// filters (search, source, campaign).
import { useState } from "react";
import { monthLabel } from "@/lib/dashboard";
import { useLocale } from "@/components/i18n/LocaleProvider";

export type LocalPeriod =
  | { mode: "all" }
  | { mode: "month"; month: string }
  | { mode: "year"; year: string }
  | { mode: "range"; from: string; to: string };

export function monthMatchesLocalPeriod(monthKey: string, period: LocalPeriod): boolean {
  if (period.mode === "all") return true;
  if (period.mode === "month") return monthKey === period.month;
  if (period.mode === "year") return monthKey.slice(0, 4) === period.year;
  return monthKey >= period.from.slice(0, 7) && monthKey <= period.to.slice(0, 7);
}

export default function LocalPeriodFilter({
  period,
  onChange,
  monthOptions,
  yearOptions,
  allTimeLabel,
}: {
  period: LocalPeriod;
  onChange: (next: LocalPeriod) => void;
  monthOptions: string[];
  yearOptions: string[];
  /** Text for the explicit "no period filter" button — callers pass their
   * own t("...") so this component stays free of any one page's dictionary
   * key naming (e.g. cohorts' historical "cohortAllTime"). */
  allTimeLabel: string;
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
          {allTimeLabel}
        </button>
        {tabOptions.map((key) => {
          const isActive =
            tab === "month" ? period.mode === "month" && period.month === key : period.mode === "year" && period.year === key;
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
