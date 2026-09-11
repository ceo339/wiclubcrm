"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteLead, findDuplicateLeads, type DuplicateGroup, type DuplicateLeadRow } from "@/app/leads/actions";
import { stageLabel } from "@/lib/leads";
import Money from "@/components/currency/Money";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";

/**
 * HQ-only tool ("Найти дубли" in LeadsBoard) that surfaces existing
 * duplicate leads so they can actually be removed — a companion to the
 * prevention built into createLead/importLeads, since those two can only
 * stop *new* duplicates, not clean up ones already in the data. Grouped
 * per club (see findDuplicateLeads) and only offers delete, which is
 * itself hq-only per Anastasiia's decision — matches the delete button in
 * LeadDetailModal.
 */
export default function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    findDuplicateLeads().then((g) => {
      if (!cancelled) setGroups(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function removeLeadEverywhere(leadId: string) {
    setGroups((prev) =>
      (prev ?? [])
        .map((g) => ({ ...g, leads: g.leads.filter((l) => l.id !== leadId) }))
        .filter((g) => g.leads.length > 1)
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{t("headingDuplicates")}</h3>
            <p className="mt-1 text-sm text-muted">{t("duplicatesSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-muted hover:text-ink-2"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {groups === null ? (
            <p className="text-sm text-muted">{t("loading")}</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted">{t("duplicatesEmptyState")}</p>
          ) : (
            groups.map((group) => <DuplicateGroupCard key={group.key} group={group} onDeleted={removeLeadEverywhere} />)
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateGroupCard({
  group,
  onDeleted,
}: {
  group: DuplicateGroup;
  onDeleted: (leadId: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-xs text-muted">
        <span className="font-medium text-ink-2">
          {t(group.field === "email" ? "duplicatesGroupEmail" : "duplicatesGroupPhone")}
        </span>
        {group.partnerName && <span>· {group.partnerName}</span>}
      </div>
      <div className="flex flex-col gap-2">
        {group.leads.map((lead) => (
          <DuplicateLeadRowItem key={lead.id} lead={lead} onDeleted={() => onDeleted(lead.id)} />
        ))}
      </div>
    </div>
  );
}

function DuplicateLeadRowItem({
  lead,
  onDeleted,
}: {
  lead: DuplicateLeadRow;
  onDeleted: () => void;
}) {
  const { locale, t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">{lead.name}</span>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">
            {stageLabel(lead.stage, locale)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {lead.email || "—"} · {lead.phone || "—"} · {lead.added_date}
          {lead.value ? (
            <>
              {" "}
              · <Money amountEur={lead.value} />
            </>
          ) : null}
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 self-start rounded-lg border border-accent-strong px-3 py-1.5 text-xs font-medium text-accent-strong hover:bg-accent/10 sm:self-center"
        >
          {t("btnDeleteLead")}
        </button>
      ) : (
        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteLead(lead.id);
                  if (res.error) setError(res.error);
                  else onDeleted();
                })
              }
              className="rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? "..." : t("yes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("cancel")}
            </button>
          </div>
          {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
        </div>
      )}
    </div>
  );
}
