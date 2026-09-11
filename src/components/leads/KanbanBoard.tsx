"use client";

import { useOptimistic, useState, useTransition } from "react";
import { STAGES, declineReasonLabel, sourceColor, sourceLabel, type StageId } from "@/lib/leads";
import { updateLeadStage } from "@/app/leads/actions";
import { computeFunnel, STALE_LEAD_DAYS } from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Lead } from "./types";
import DeclineModal from "./DeclineModal";

function daysSince(dateStr: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

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

  // Real "% дошли до этого этапа" per stage — the same cumulative-forward
  // calculation the Home funnel widget uses (see computeFunnel in
  // lib/dashboard.ts), applied to whatever's currently on this board
  // (already filtered by search/source above). Deliberately NOT the
  // prototype's fixed STAGES[].prob constant: that's a static assumption
  // per stage, not something observed from this board's own leads, and
  // this app already has the real number one calculation away. "Declined"
  // isn't part of the forward funnel, so it gets no percentage pill.
  const funnelByStage = new Map(computeFunnel(items).map((s) => [s.id, s]));
  const now = new Date();

  return (
    <>
      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const stageLeads = items.filter((l) => l.stage === stage.id);
          const stageValue = stageLeads.reduce((sum, l) => sum + (l.value ?? 0), 0);
          const pctReached = funnelByStage.get(stage.id)?.pctFromPrevious ?? null;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-surface-2 p-3"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 pb-2.5">
                <span className="text-sm font-medium text-ink-2">{t(stage.labelKey)}</span>
                {pctReached !== null && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-strong">
                    {pctReached}%
                  </span>
                )}
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">
                  {stageLeads.length}
                </span>
                {stageValue > 0 && (
                  <span className="ml-auto text-xs font-medium text-muted">
                    <Money amountEur={stageValue} />
                  </span>
                )}
              </div>
              <div className="flex min-h-[120px] flex-col gap-2">
                {stageLeads.map((lead) => {
                  const isStale = daysSince(lead.updated_at, now) > STALE_LEAD_DAYS;
                  return (
                    <div
                      key={lead.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(lead.id)}
                      onClick={() => onSelect(lead.id)}
                      className={`rounded-[12px] border border-border bg-background p-3 text-sm shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-card-hover ${
                        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">{lead.name}</span>
                        <span className="shrink-0 font-semibold text-foreground">
                          {lead.value ? <Money amountEur={lead.value} /> : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {lead.source && (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-sm"
                              style={{ background: sourceColor(lead.source) }}
                            />
                            {sourceLabel(lead.source, locale)}
                          </span>
                        )}
                        {isStale && stage.id !== "paid" && stage.id !== "declined" && (
                          <span className="rounded-full bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">
                            {t("daysCount", { n: daysSince(lead.updated_at, now) })}
                          </span>
                        )}
                        {showPartner && lead.partner_name && <span className="truncate">{lead.partner_name}</span>}
                      </div>
                      {stage.id === "declined" && lead.decline_reason && (
                        <div className="mt-1 text-xs text-accent-strong">
                          {lead.decline_note || declineReasonLabel(lead.decline_reason, locale)}
                        </div>
                      )}
                    </div>
                  );
                })}
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
