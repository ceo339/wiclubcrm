"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { QUALIFIED_TAB_STAGES } from "@/lib/franchise";
import {
  computeFranchiseFunnel,
  franchiseMonthsWithActivity,
  franchiseYearsWithActivity,
} from "@/lib/franchiseDashboard";
import { inPeriod, monthLabel, type Period } from "@/lib/dashboard";
import { approximateLocation } from "@/lib/geo";
import type { FranchiseCandidate } from "./types";
import KanbanBoard from "./KanbanBoard";
import CandidateDetailModal from "./CandidateDetailModal";
import FranchiseFunnelBars from "./FranchiseFunnelBars";

/**
 * Thin wrapper mirroring leads/LeadsBoard.tsx's role (own the
 * selected-candidate state, render the board + the modal it opens), but
 * trimmed to the "skeleton" scope Anastasiia agreed to build first
 * ("Сначала костяк, потом остальное") — originally no list view, no filters
 * beyond a simple search box, no import modal. Round 46 part 4 ("тут нужен
 * филтр как на главной по периодам. и фильтр по странам и по городам")
 * added period/country/city filters (see the useMemo/useState block below
 * the qualifiedFunnel one) — everything else here is still that original
 * skeleton.
 *
 * Round 40 (28 сен 2026) briefly grew a "Канбан"/"Аналитика" tab here,
 * after the franchise dashboard's original home — a `?scope=franchise`
 * query param on Главная — reproducibly failed to render in production for
 * reasons that resisted every fix tried. Round 42 (28 сен 2026) moved the
 * dashboard again, this time to Главная itself as its default view for
 * hq/viewer accounts (see FranchiseHomeDashboard.tsx and the
 * "Франчайзи"/"Клубы" toggle in CityScopeSwitcher) — so this file goes
 * back to being just the kanban pipeline, same as before round 40.
 */
export default function FranchiseBoard({
  initialCandidates,
  canEdit,
  canBill,
  qualifiedIds,
}: {
  initialCandidates: FranchiseCandidate[];
  canEdit: boolean;
  /** Round 49: may bill (finance director) even when the card is read-only. */
  canBill?: boolean;
  /** ids of candidates who ever reached "Фин. модель отправлена" or later
   * (round 40) — see franchise/page.tsx for how this is computed. */
  qualifiedIds: string[];
}) {
  const { t, locale } = useLocale();
  const [search, setSearch] = useState("");
  // "?open=<id>" — same deep-link convention as leads/LeadsBoard.tsx, how a
  // link from outside this page (the home page's "Задачи по кандидаткам"
  // widget, round 44) opens a specific candidate's card directly.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setSelectedId(openId);
  }, [searchParams]);
  // "сделать отдельно модуль «квалифицированные»" (Anastasiia, 28 сен
  // 2026) — a tab alongside "Все" rather than a whole separate page, so it
  // shares the same board/search/detail-modal plumbing already here.
  const [view, setView] = useState<"all" | "qualified">("all");
  const qualifiedIdSet = useMemo(() => new Set(qualifiedIds), [qualifiedIds]);

  const byView = useMemo(
    () => (view === "qualified" ? initialCandidates.filter((c) => qualifiedIdSet.has(c.id)) : initialCandidates),
    [initialCandidates, view, qualifiedIdSet]
  );

  // "воронка отображалась со стадии фин модель отправлена" (round 44) —
  // scoped to the same population this tab already shows (byView, before
  // the free-text search box narrows it further).
  const qualifiedFunnel = useMemo(
    () => (view === "qualified" ? computeFranchiseFunnel(byView, "fin_model_sent") : []),
    [byView, view]
  );

  // "тут нужен филтр как на главной по периодам. и фильтр по странам и по
  // городам" (Anastasiia, round 46 part 4). `null` = «Все время» — the
  // board's default has always shown every candidate regardless of when
  // they applied, so this filter starts off, not pinned to the current
  // month the way Главная's period switcher is.
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const monthOptions = useMemo(() => franchiseMonthsWithActivity(initialCandidates), [initialCandidates]);
  const yearOptions = useMemo(() => franchiseYearsWithActivity(initialCandidates), [initialCandidates]);
  // Only month/year are offered in this compact filter (see the <select>
  // below) — "range" mode is never produced by handlePeriodChange, but the
  // shared Period type includes it, so it still needs a fallback here.
  const periodSelectValue =
    periodFilter === null
      ? "all"
      : periodFilter.mode === "year"
        ? `y:${periodFilter.year}`
        : periodFilter.mode === "month"
          ? `m:${periodFilter.month}`
          : "all";
  function handlePeriodChange(value: string) {
    if (value === "all") setPeriodFilter(null);
    else if (value.startsWith("y:")) setPeriodFilter({ mode: "year", year: value.slice(2) });
    else if (value.startsWith("m:")) setPeriodFilter({ mode: "month", month: value.slice(2) });
  }

  // Страна — приблизительное сопоставление (approximateLocation, тот же
  // подход, что уже согласован для «Географии» на Главной): country это
  // свободный текст анкеты (176 разных значений на 233 строки), точный
  // список из него был бы бесполезным фильтром. Список опций строится по
  // initialCandidates (не byView/filtered), чтобы не менялся сам под собой,
  // пока стоят другие фильтры.
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const { countryOptions, unmatchedCountryCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let unmatched = 0;
    for (const c of initialCandidates) {
      const hit = approximateLocation(c.country);
      if (!hit) {
        unmatched += 1;
        continue;
      }
      counts.set(hit.country, (counts.get(hit.country) ?? 0) + 1);
    }
    return {
      countryOptions: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([country]) => country),
      unmatchedCountryCount: unmatched,
    };
  }, [initialCandidates]);

  // Город — наоборот, показывается КАК ЕСТЬ, без сопоставления: target_city
  // заполнен лишь у ~48 кандидаток и почти каждое значение уникально, так
  // что "приблизительно" тут ничего не выигрывает, а точность теряет.
  const [cityFilter, setCityFilter] = useState<string>("all");
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of initialCandidates) {
      const city = (c.target_city ?? "").trim();
      if (city) set.add(city);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [initialCandidates]);

  const hasActiveFilters = periodFilter !== null || countryFilter !== "all" || cityFilter !== "all";
  function resetFilters() {
    setPeriodFilter(null);
    setCountryFilter("all");
    setCityFilter("all");
  }

  const filtered = useMemo(() => {
    let rows = byView;
    if (periodFilter) rows = rows.filter((c) => inPeriod(periodFilter, c.submitted_at));
    if (countryFilter !== "all") {
      rows = rows.filter((c) => {
        const hit = approximateLocation(c.country);
        return countryFilter === "unmatched" ? !hit : hit?.country === countryFilter;
      });
    }
    if (cityFilter !== "all") {
      rows = rows.filter((c) => (c.target_city ?? "").trim() === cityFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.target_city ?? "").toLowerCase().includes(q) ||
          (c.country ?? "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [byView, periodFilter, countryFilter, cityFilter, search]);

  const selected = initialCandidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border-strong bg-surface-2 p-0.5 text-sm">
          {(["all", "qualified"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                view === v ? "bg-background text-foreground shadow-card" : "text-muted hover:text-ink-2"
              }`}
            >
              {v === "all" ? t("fTabAll") : t("fTabQualified")}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("fSearchPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent sm:w-64"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodSelectValue}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("fFilterPeriodAll")}</option>
          <optgroup label={t("periodTabMonths")}>
            {monthOptions.map((key) => (
              <option key={key} value={`m:${key}`}>
                {monthLabel(key, locale)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("periodTabYear")}>
            {yearOptions.map((key) => (
              <option key={key} value={`y:${key}`}>
                {key}
              </option>
            ))}
          </optgroup>
        </select>

        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("fFilterCountryAll")}</option>
          {countryOptions.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
          {unmatchedCountryCount > 0 && <option value="unmatched">{t("fFilterCountryUnmatched")}</option>}
        </select>

        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("fFilterCityAll")}</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink-2"
          >
            {t("fFilterReset")}
          </button>
        )}

        <span className="ml-auto text-xs text-muted">{t("fCandidatesCount", { count: filtered.length })}</span>
      </div>

      {view === "qualified" && <p className="text-xs text-muted">{t("fQualifiedHint")}</p>}

      {view === "qualified" && (
        <div className="rounded-xl border border-border bg-background shadow-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("headingQualifiedFunnel")}</h2>
          <div className="mt-4">
            <FranchiseFunnelBars funnel={qualifiedFunnel} />
          </div>
        </div>
      )}

      <KanbanBoard
        candidates={filtered}
        canEdit={canEdit}
        onSelect={setSelectedId}
        stages={view === "qualified" ? QUALIFIED_TAB_STAGES : undefined}
      />

      {selected && (
        <CandidateDetailModal
          key={selected.id}
          candidate={selected}
          canEdit={canEdit}
          canBill={canBill ?? canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
