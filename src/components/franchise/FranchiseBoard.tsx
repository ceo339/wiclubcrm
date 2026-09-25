"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { FranchiseCandidate } from "./types";
import KanbanBoard from "./KanbanBoard";
import CandidateDetailModal from "./CandidateDetailModal";

/**
 * Thin wrapper mirroring leads/LeadsBoard.tsx's role (own the
 * selected-candidate state, render the board + the modal it opens), but
 * trimmed to the "skeleton" scope Anastasiia agreed to build first
 * ("Сначала костяк, потом остальное") — no list view, no filters beyond a
 * simple search box, no import modal. Those can follow once the pipeline
 * itself is in daily use.
 */
export default function FranchiseBoard({
  initialCandidates,
  canEdit,
}: {
  initialCandidates: FranchiseCandidate[];
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialCandidates;
    return initialCandidates.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.target_city ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialCandidates, search]);

  const selected = initialCandidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("fSearchPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent sm:w-64"
        />
        <span className="ml-auto text-xs text-muted">
          {t("fCandidatesCount", { count: initialCandidates.length })}
        </span>
      </div>

      <KanbanBoard candidates={filtered} canEdit={canEdit} onSelect={setSelectedId} />

      {selected && (
        <CandidateDetailModal
          key={selected.id}
          candidate={selected}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
