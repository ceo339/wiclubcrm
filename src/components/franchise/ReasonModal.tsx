"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import type { FranchiseStageId } from "@/lib/franchise";

/**
 * Free-text reason prompt for the two terminal stages (Отказ/Пауза) —
 * unlike leads' DeclineModal, there's no fixed reasons list here (Anastasiia
 * just said "с причиной отказала", no enumerated set), so this is a single
 * textarea shared by both stages, titled for whichever one triggered it.
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
  const [reason, setReason] = useState("");
  const t = useT();
  const titleKey = stage === "declined" ? "fReasonModalTitleDeclined" : "fReasonModalTitlePaused";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{t(titleKey)}</h3>
        <p className="mt-1 text-sm text-muted">{t("fReasonModalSubtitle", { name: candidateName })}</p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fFieldReason")}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder={t("placeholderDescribeReason")}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => onConfirm(reason.trim() || null)}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
