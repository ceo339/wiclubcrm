"use client";

import { useActionState, useState } from "react";
import { updatePayment, deletePayment, type ActionResult } from "@/app/payments/actions";
import { STATUSES, statusLabel } from "@/lib/payments";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Payment } from "./types";

const initialState: ActionResult = { error: null };

export default function EditPaymentModal({
  payment,
  canEdit,
  onClose,
}: {
  payment: Payment;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await updatePayment(payment.id, formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePayment(payment.id);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{payment.member_name ?? payment.lead_name ?? t("fallbackPaymentTitle")}</h3>
        {payment.product_name && <p className="mt-1 text-sm text-muted">{payment.product_name}</p>}

        {canEdit ? (
          <form action={formAction} className="mt-4">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("fieldValueEur")}</span>
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={payment.amount}
                  required
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">{t("colStatus")}</span>
                <select
                  name="status"
                  defaultValue={payment.status ?? "paid"}
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
                  defaultValue={payment.paid_date}
                  required
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </label>
            </div>

            {(state.error || deleteError) && (
              <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
                {t((state.error ?? deleteError) as string)}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || pending}
                className="text-sm text-accent-strong hover:underline disabled:opacity-50"
              >
                {deleting ? "..." : t("delete")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending || deleting}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  {pending ? "..." : t("save")}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-1 text-sm text-ink-2">
            <p>
              {t("colAmount")}: <Money amountEur={payment.amount} />
            </p>
            <p>{t("colDate")}: {payment.paid_date}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
              >
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
