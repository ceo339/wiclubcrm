"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { QUALIFIED_TAB_STAGES } from "@/lib/franchise";
import { computeFranchiseFunnel } from "@/lib/franchiseDashboard";
import type { FranchiseCandidate } from "./types";
import KanbanBoard from "./KanbanBoard";
import CandidateDetailModal from "./CandidateDetailModal";
import FranchiseFunnelBars from "./FranchiseFunnelBars";

/**
 * Thin wrapper mirroring leads/LeadsBoard.tsx's role (own the
 * selected-candidate state, render the board + the modal it opens), but
 * trimmed to the "skeleton" scope Anastasiia agreed to build first
 * ("Сначала костяк, потом остальное") — no list view, no filters beyond a
 * simple search box, no import modal. Those can follow once the pipeline
 * itself is in daily use.
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
  qualifiedIds,
}: {
  initialCandidates: FranchiseCandidate[];
  canEdit: boolean;
  /** ids of candidates who ever reached "Фин. модель отправлена" or later
   * (round 40) — see franchise/page.tsx for how this is computed. */
  qualifiedIds: string[];
}) {
  const { t } = useLocale();
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
        <span className="ml-auto text-xs text-muted">{t("fCandidatesCount", { count: byView.length })}</span>
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
        <CandidateDetailModal key={selected.id} candidate={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
