"use client";

import { useState } from "react";
import { DECLINE_REASONS } from "@/lib/leads";
import { useT } from "@/components/i18n/LocaleProvider";

export default function DeclineModal({
  leadName,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  onCancel: () => void;
  onConfirm: (reason: string, note: string | null) => void;
}) {
  const [reason, setReason] = useState<string>(DECLINE_REASONS[0]);
  const [note, setNote] = useState("");
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">
          {t("declineModalTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted">{t("declineModalSubtitle", { name: leadName })}</p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fieldReason")}</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {DECLINE_REASONS.map((id) => (
              <option key={id} value={id}>
                {t(id)}
              </option>
            ))}
          </select>
        </label>

        {reason === "declineOther" && (
          <label className="mt-3 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldDescribeReason")}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            onClick={() => onConfirm(reason, reason === "declineOther" ? note || null : null)}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
