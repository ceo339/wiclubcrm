"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { inPeriod, type Period } from "@/lib/dashboard";
import {
  computeFranchiseFunnel,
  computeFranchiseSourceBreakdown,
  findStaleFranchiseCandidates,
  franchiseConversionRate,
  franchiseMonthsWithActivity,
  franchiseYearsWithActivity,
  monthlyFranchiseSubmissions,
} from "@/lib/franchiseDashboard";
import type { FranchiseCandidate } from "./types";
import KanbanBoard from "./KanbanBoard";
import CandidateDetailModal from "./CandidateDetailModal";
import FranchiseDashboard from "./FranchiseDashboard";

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Thin wrapper mirroring leads/LeadsBoard.tsx's role (own the
 * selected-candidate state, render the board + the modal it opens), but
 * trimmed to the "skeleton" scope Anastasiia agreed to build first
 * ("Сначала костяк, потом остальное") — no list view, no filters beyond a
 * simple search box, no import modal. Those can follow once the pipeline
 * itself is in daily use.
 *
 * Round 40 follow-up (28 сен 2026): gained a "Канбан"/"Аналитика" tab on
 * top of the existing "Все"/"Квалифицированные" one. The franchise
 * dashboard was originally meant to live on Главная behind a
 * `?scope=franchise` query param — that reproducibly failed to render in
 * production (address bar updated, page never did) for reasons that
 * resisted every fix tried, including force-dynamic and ruling out every
 * caching layer we could reach. Anastasiia asked for the simpler shape
 * instead ("франчайзи отдельная кнопка"), so the dashboard now lives here,
 * on the /franchise route that's been solid since round 38, driven
 * entirely by client-side React state — no URL, no server round trip for
 * switching tabs or periods.
 */
export default function FranchiseBoard({
  initialCandidates,
  canEdit,
  qualifiedIds,
}: {
  initialCandidates: FranchiseCandidate[];
  canEdit: boolean;
  /** ids of candidates who ever reached "Фин. модель отправлена" or later
   * (round 40) — see franchise/page.tsx for how this is computed. */
  qualifiedIds: string[];
}) {
  const { t } = useLocale();
  const [mainTab, setMainTab] = useState<"kanban" | "analytics">("kanban");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "сделать отдельно модуль «квалифицированные»" (Anastasiia, 28 сен
  // 2026) — a tab alongside "Все" rather than a whole separate page, so it
  // shares the same board/search/detail-modal plumbing already here.
  const [view, setView] = useState<"all" | "qualified">("all");
  const qualifiedIdSet = useMemo(() => new Set(qualifiedIds), [qualifiedIds]);
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });

  const byView = useMemo(
    () => (view === "qualified" ? initialCandidates.filter((c) => qualifiedIdSet.has(c.id)) : initialCandidates),
    [initialCandidates, view, qualifiedIdSet]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byView;
    return byView.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.target_city ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q)
      );
    });
  }, [byView, search]);

  const selected = initialCandidates.find((c) => c.id === selectedId) ?? null;

  // Everything the analytics tab needs, computed client-side from the same
  // `initialCandidates` the kanban already has — no extra fetch, no extra
  // server round trip, so switching to this tab (or changing the period
  // within it) is instant and can't hit whatever silently broke the old
  // server-driven query-param version.
  const inPeriodCandidates = useMemo(
    () => initialCandidates.filter((c) => inPeriod(period, c.submitted_at)),
    [initialCandidates, period]
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="inline-flex items-center gap-0.5 self-start rounded-lg border border-border p-0.5 text-sm">
        {(["kanban", "analytics"] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setMainTab(tb)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              mainTab === tb ? "bg-surface-2 text-foreground" : "text-muted hover:text-ink-2"
            }`}
          >
            {tb === "kanban" ? t("fTabKanban") : t("fTabAnalytics")}
          </button>
        ))}
      </div>

      {mainTab === "analytics" ? (
        <FranchiseDashboard
          period={period}
          onSelectPeriod={setPeriod}
          monthOptions={franchiseMonthsWithActivity(initialCandidates)}
          yearOptions={franchiseYearsWithActivity(initialCandidates)}
          submittedCount={inPeriodCandidates.length}
          qualifiedCount={qualifiedIdSet.size}
          activeCount={initialCandidates.filter((c) => c.stage === "active").length}
          conversion={franchiseConversionRate(initialCandidates)}
          submissionTrend={monthlyFranchiseSubmissions(initialCandidates)}
          funnel={computeFranchiseFunnel(initialCandidates)}
          sourceBreakdown={computeFranchiseSourceBreakdown(inPeriodCandidates)}
          staleCandidates={findStaleFranchiseCandidates(initialCandidates)}
        />
      ) : (
        <>
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
            <span className="ml-auto text-xs text-muted">
              {t("fCandidatesCount", { count: byView.length })}
            </span>
          </div>
          {view === "qualified" && <p className="text-xs text-muted">{t("fQualifiedHint")}</p>}

          <KanbanBoard candidates={filtered} canEdit={canEdit} onSelect={setSelectedId} />

          {selected && (
            <CandidateDetailModal
              key={selected.id}
              candidate={selected}
              canEdit={canEdit}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
