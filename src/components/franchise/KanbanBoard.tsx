"use client";

import { useOptimistic, useState, useTransition } from "react";
import { VISIBLE_FRANCHISE_STAGES, FRANCHISE_TERMINAL_STAGES, type FranchiseStageId } from "@/lib/franchise";
import { updateCandidateStage } from "@/app/franchise/actions";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { FranchiseCandidate } from "./types";
import ReasonModal from "./ReasonModal";

type StageUpdate = { id: string; stage: FranchiseStageId; reason: string | null };

/**
 * Same horizontal-scroll kanban shell as leads/KanbanBoard.tsx (round 19's
 * mobile pattern — `overflow-x-auto` on the row, each column a fixed-width
 * shrink-0 card), just with 17 columns instead of 6. A column header shows
 * the date the candidate CURRENTLY on top of the pile reached this stage
 * only implicitly (see the card itself, not the header) — with this many
 * columns a header-level date would be meaningless across many candidates.
 */
export default function KanbanBoard({
  candidates,
  canEdit,
  onSelect,
}: {
  candidates: FranchiseCandidate[];
  canEdit: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  const [items, applyOptimistic] = useOptimistic(candidates, (state, update: StageUpdate) =>
    state.map((c) =>
      c.id === update.id ? { ...c, stage: update.stage, reject_reason: update.reason } : c
    )
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{ candidate: FranchiseCandidate; stage: "declined" | "paused" } | null>(
    null
  );
  const [, startTransition] = useTransition();

  function applyStage(id: string, stage: FranchiseStageId, reason?: string | null) {
    startTransition(async () => {
      applyOptimistic({ id, stage, reason: reason ?? null });
      await updateCandidateStage(id, stage, reason ?? null);
    });
  }

  function handleDrop(stage: FranchiseStageId) {
    if (!canEdit || !dragId) return;
    const candidate = items.find((c) => c.id === dragId);
    setDragId(null);
    if (!candidate || candidate.stage === stage) return;

    if (FRANCHISE_TERMINAL_STAGES.includes(stage)) {
      setReasonTarget({ candidate, stage: stage as "declined" | "paused" });
      return;
    }
    applyStage(candidate.id, stage);
  }

  return (
    <>
      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {VISIBLE_FRANCHISE_STAGES.map((stage) => {
          const stageCandidates = items.filter((c) => c.stage === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
              className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-card"
            >
              <div className="flex items-center gap-2 border-b border-border-strong bg-surface-3 px-3 py-2.5">
                <span className="text-sm font-medium text-ink-2">{t(stage.labelKey)}</span>
                <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                  {stageCandidates.length}
                </span>
              </div>
              <div className="flex min-h-[120px] max-h-[65vh] flex-col gap-2 overflow-y-auto p-3">
                {stageCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(candidate.id)}
                    onClick={() => onSelect(candidate.id)}
                    className={`rounded-[12px] border border-border bg-background p-3 text-sm shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-card-hover ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    }`}
                  >
                    <div className="truncate font-medium text-foreground">{candidate.name}</div>
                    <div className="mt-1 truncate text-xs text-muted">
                      {candidate.target_city || candidate.country || "—"}
                    </div>
                    {/* "добавь отображение комментария последнего в
                        канбане" (Anastasiia, round 44) — same one-line
                        truncated preview as leads/KanbanBoard.tsx. */}
                    {candidate.latest_comment && (
                      <div className="mt-1 truncate text-xs italic text-muted">{candidate.latest_comment}</div>
                    )}
                    {(stage.id === "declined" || stage.id === "paused") && candidate.reject_reason && (
                      <div className="mt-1 truncate text-xs text-accent-strong">{candidate.reject_reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {reasonTarget && (
        <ReasonModal
          candidateName={reasonTarget.candidate.name}
          stage={reasonTarget.stage}
          onCancel={() => setReasonTarget(null)}
          onConfirm={(reason) => {
            applyStage(reasonTarget.candidate.id, reasonTarget.stage, reason);
            setReasonTarget(null);
          }}
        />
      )}
    </>
  );
}
