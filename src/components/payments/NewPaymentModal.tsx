"use client";

import { useActionState, useState } from "react";
import { createPayment, type ActionResult } from "@/app/payments/actions";
import { STATUSES, statusLabel, todayIso } from "@/lib/payments";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { MemberOption } from "./types";

const initialState: ActionResult = { error: null };

export default function NewPaymentModal({
  members,
  onClose,
}: {
  members: MemberOption[];
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [targetKey, setTargetKey] = useState("");
  const [amount, setAmount] = useState("");

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await createPayment(formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  function handleTargetChange(key: string) {
    setTargetKey(key);
    const target = members.find((m) => m.key === key);
    if (target?.defaultAmount != null) setAmount(String(target.defaultAmount));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={formAction}>
          <h3 className="text-base font-semibold text-foreground">{t("headingNewPayment")}</h3>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colMember")}</span>
              <select
                name="target"
                value={targetKey}
                onChange={(e) => handleTargetChange(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">{t("optionSelectMember")}</option>
                {members.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              {members.length === 0 && (
                <span className="text-xs text-muted">{t("emptyAddMemberFirst")}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldValueEur")}</span>
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colStatus")}</span>
              <select
                name="status"
                defaultValue="paid"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {statusLabel(s.id, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("colDate")}</span>
              <input
                name="paid_date"
                type="date"
                defaultValue={todayIso()}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>

          {state.error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(state.error)}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || members.length === 0}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "..." : t("add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
