"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { getCandidatePayments, type FranchisePayment } from "@/app/franchise/payments/actions";
import type { FranchiseStageId } from "@/lib/franchise";
import { FranchisePaymentForm, InvoiceLinks, PaymentActions, RefundNote, PaymentStatusPill, formatUsd, paymentKindText } from "./PaymentParts";
import BillingDetailsSection from "./BillingDetailsSection";
import { netPaidOf } from "@/lib/franchisePayments";

/** «Оплаты» block inside the candidate card (round 48). `canEdit` here means
 * «may bill» (HQ, МПП, финдиректор) — see lib/franchiseAccess. */
export default function CandidatePaymentsSection({
  candidateId,
  canEdit,
  onStageChanged,
}: {
  candidateId: string;
  canEdit: boolean;
  onStageChanged: (stage: FranchiseStageId) => void;
}) {
  const { locale, t } = useLocale();
  const [payments, setPayments] = useState<FranchisePayment[] | null>(null);
  const [adding, setAdding] = useState(false);

  function reload() {
    getCandidatePayments(candidateId).then(setPayments);
  }
  useEffect(reload, [candidateId]);

  function changed(stage?: FranchiseStageId) {
    setAdding(false);
    if (stage) onStageChanged(stage);
    reload();
  }

  const live = (payments ?? []).filter((p) => p.status !== "cancelled");
  const paid = live.reduce((s, p) => s + netPaidOf(p), 0);
  const due = live.filter((p) => p.status === "invoiced").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("fpHeading")}</span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-3"
          >
            + {t("fpNewInvoice")}
          </button>
        )}
      </div>

      {live.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span>
            {t("fpPaidTotal")}: <b>{formatUsd(paid, locale)}</b>
          </span>
          <span>
            {t("fpDueTotal")}: <b>{formatUsd(due, locale)}</b>
          </span>
        </div>
      )}

      <BillingDetailsSection candidateId={candidateId} canEdit={canEdit} />

      {adding && (
        <div className="mt-2">
          <FranchisePaymentForm candidateId={candidateId} onDone={changed} onCancel={() => setAdding(false)} />
        </div>
      )}

      {payments === null ? (
        <p className="mt-2 text-xs text-muted">{t("loading")}</p>
      ) : payments.length === 0 ? (
        !adding && <p className="mt-2 text-xs text-muted">{t("fpEmptyCandidate")}</p>
      ) : (
        <div className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
              <span className="min-w-[120px] flex-1 font-medium text-ink-2">
                {paymentKindText(p, t, locale)}
                {p.note && <span className="block font-normal text-muted">{p.note}</span>}
                <RefundNote payment={p} />
              </span>
              <span className="font-semibold text-foreground">{formatUsd(Number(p.amount), locale)}</span>
              <span className="text-muted">
                {p.status === "paid" && p.paid_date ? `${t("fpPaidOn")} ${p.paid_date}` : p.due_date ? `${t("fpDueOn")} ${p.due_date}` : p.invoice_date}
              </span>
              <PaymentStatusPill payment={p} />
              <InvoiceLinks payment={p} />
              {canEdit && <PaymentActions payment={p} onChanged={changed} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
