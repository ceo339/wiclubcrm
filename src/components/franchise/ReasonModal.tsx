"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import { FRANCHISE_DECLINE_REASONS, type FranchiseStageId } from "@/lib/franchise";

/**
 * Reason prompt for the two terminal stages (Отказ/Пауза). Round 44
 * ("Добавь вариант в отказе - игнор как причина отказа, тренер") gave
 * "Отказ" a preset dropdown (Игнор/Тренер/Другое, same dictionary-key
 * convention as leads' own DECLINE_REASONS) — Пауза stays the original free
 * textarea, per Anastasiia's own scoping when asked (no enumerated set was
 * ever requested for it). Either way the stored `reject_reason` is still
 * just one plain text field — "Другое" (or Пауза) writes whatever the
 * person typed, a preset option writes its own label text, so existing
 * display code (candidate.reject_reason shown raw on the card/kanban)
 * doesn't need to know which path produced it.
 */
export default function ReasonModal({
  candidateName,
  stage,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  stage: Extract<FranchiseStageId, "declined" | "paused">;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [presetReason, setPresetReason] = useState<(typeof FRANCHISE_DECLINE_REASONS)[number]>(
    FRANCHISE_DECLINE_REASONS[0]
  );
  const [customReason, setCustomReason] = useState("");
  const [pausedReason, setPausedReason] = useState("");
  const t = useT();
  const titleKey = stage === "declined" ? "fReasonModalTitleDeclined" : "fReasonModalTitlePaused";
  const isOther = presetReason === "fDeclineReasonOther";

  function handleConfirm() {
    if (stage === "paused") {
      onConfirm(pausedReason.trim() || null);
      return;
    }
    onConfirm(isOther ? customReason.trim() || null : t(presetReason));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{t(titleKey)}</h3>
        <p className="mt-1 text-sm text-muted">{t("fReasonModalSubtitle", { name: candidateName })}</p>

        {stage === "declined" ? (
          <>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fFieldReason")}</span>
              <select
                value={presetReason}
                onChange={(e) => setPresetReason(e.target.value as (typeof FRANCHISE_DECLINE_REASONS)[number])}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {FRANCHISE_DECLINE_REASONS.map((key) => (
                  <option key={key} value={key}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>

            {isOther && (
              <label className="mt-3 flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("fieldDescribeReason")}</span>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder={t("placeholderDescribeReason")}
                />
              </label>
            )}
          </>
        ) : (
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fFieldReason")}</span>
            <textarea
              value={pausedReason}
              onChange={(e) => setPausedReason(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder={t("placeholderDescribeReason")}
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
