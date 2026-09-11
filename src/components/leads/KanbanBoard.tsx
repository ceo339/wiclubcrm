"use client";

import { useOptimistic, useState, useTransition } from "react";
import { STAGES, declineReasonLabel, type StageId } from "@/lib/leads";
import { updateLeadStage } from "@/app/leads/actions";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Lead } from "./types";
import DeclineModal from "./DeclineModal";

type StageUpdate = { id: string; stage: StageId; reason: string | null; note: string | null };

export default function KanbanBoard({
  leads,
  canEdit,
  showPartner,
  onSelect,
}: {
  leads: Lead[];
  canEdit: boolean;
  showPartner: boolean;
  onSelect: (id: string) => void;
}) {
  const { locale, t } = useLocale();
  const [items, applyOptimistic] = useOptimistic(leads, (state, update: StageUpdate) =>
    state.map((l) =>
      l.id === update.id
        ? { ...l, stage: update.stage, decline_reason: update.reason, decline_note: update.note }
        : l
    )
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Lead | null>(null);
  const [, startTransition] = useTransition();

  function applyStage(id: string, stage: StageId, decline?: { reason: string; note: string | null }) {
    const reason = stage === "declined" ? decline?.reason ?? null : null;
    const note = stage === "declined" ? decline?.note ?? null : null;
    startTransition(async () => {
      applyOptimistic({ id, stage, reason, note });
      await updateLeadStage(id, stage, decline);
    });
  }

  function handleDrop(stage: StageId) {
    if (!canEdit || !dragId) return;
    const lead = items.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.stage === stage) return;

    if (stage === "declined") {
      setDeclineTarget(lead);
      return;
    }
    applyStage(lead.id, stage);
  }

  return (
    <>
      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const stageLeads = items.filter((l) => l.stage === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-surface-2 p-3"
            >
              <div className="flex items-center justify-between px-0.5 pb-2.5">
                <span className="text-sm font-medium text-ink-2">{t(stage.labelKey)}</span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">
                  {stageLeads.length}
                </span>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(lead.id)}
                    onClick={() => onSelect(lead.id)}
                    className={`rounded-[12px] border border-border bg-background p-3 text-sm shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-card-hover ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    }`}
                  >
                    <div className="font-medium text-foreground">{lead.name}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {lead.value ? <Money amountEur={lead.value} /> : "—"}
                      {showPartner && lead.partner_name ? ` · ${lead.partner_name}` : ""}
                    </div>
                    {stage.id === "declined" && lead.decline_reason && (
                      <div className="mt-1 text-xs text-accent-strong">
                        {lead.decline_note || declineReasonLabel(lead.decline_reason, locale)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {declineTarget && (
        <DeclineModal
          leadName={declineTarget.name}
          onCancel={() => setDeclineTarget(null)}
          onConfirm={(reason, note) => {
            applyStage(declineTarget.id, "declined", { reason, note });
            setDeclineTarget(null);
          }}
        />
      )}
    </>
  );
}
