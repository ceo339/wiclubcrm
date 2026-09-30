"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import {
  createFranchisePayment,
  deleteFranchisePayment,
  sendFranchiseInvoice,
  setFranchisePaymentStatus,
  type FranchisePayment,
} from "@/app/franchise/payments/actions";
import type { FranchiseStageId } from "@/lib/franchise";
import {
  FRANCHISE_PAYMENT_KINDS,
  formatUsd,
  isOverdue,
  kindLabelKey,
  statusLabelKey,
} from "@/lib/franchisePayments";
import { defaultInvoiceDescription } from "@/lib/invoice/franchisor";

const inputCls =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** New-invoice form — used inside the candidate card (fixed candidate) and on
 * the «Оплаты франчайзи» page (candidate picker). */
export function FranchisePaymentForm({
  candidateId,
  candidateOptions,
  onDone,
  onCancel,
}: {
  candidateId?: string;
  candidateOptions?: { id: string; label: string }[];
  onDone: (stage?: FranchiseStageId) => void;
  onCancel?: () => void;
}) {
  const { t } = useLocale();
  const [pickedCandidate, setPickedCandidate] = useState(candidateId ?? "");
  const [kind, setKind] = useState("lump_sum");
  const [amount, setAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [periodMonth, setPeriodMonth] = useState(todayIso().slice(0, 7));
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(false);
  const [paidDate, setPaidDate] = useState(todayIso());
  // Round 49: the English line printed on the invoice — prefilled per kind
  // (and royalty month) until the user types her own wording.
  const [description, setDescription] = useState(defaultInvoiceDescription("lump_sum", null));
  const [descTouched, setDescTouched] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useEffect(() => {
    if (!descTouched) setDescription(defaultInvoiceDescription(kind, kind === "royalty" ? `${periodMonth}-01` : null));
  }, [kind, periodMonth, descTouched]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const target = candidateId ?? pickedCandidate;
    if (!target) return setError("fpErrPickCandidate");
    setError(null);
    start(async () => {
      const res = await createFranchisePayment({
        candidateId: target,
        kind,
        amount: Number(amount.replace(",", ".")),
        invoiceDate,
        dueDate: dueDate || null,
        periodMonth: kind === "royalty" ? periodMonth : null,
        description,
        note,
        paid,
        paidDate: paid ? paidDate : null,
        sendNow: !paid && sendNow,
      });
      if (res.error && res.saved) {
        // The invoice is saved; only emailing it failed — say so, keep going.
        alertError(`${t("fpSavedButNotSent")} ${t(res.error)}`);
        onDone(res.stage);
      } else if (res.error) {
        setError(res.error);
      } else {
        if (res.sentTo) setSentTo(res.sentTo);
        onDone(res.stage);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3">
      {candidateOptions && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("fpFieldCandidate")}
          <select value={pickedCandidate} onChange={(e) => setPickedCandidate(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {candidateOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("fpFieldKind")}
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            {FRANCHISE_PAYMENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {t(k.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("fpFieldAmount")}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("fpFieldInvoiceDate")}
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("fpFieldDueDate")}
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </label>
        {kind === "royalty" && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("fpFieldPeriod")}
            <input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className={inputCls} />
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        {t("fpFieldDescription")}
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescTouched(true);
          }}
          rows={2}
          className={inputCls}
        />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("fpFieldNote")} className={inputCls} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-3.5 w-3.5" />
          {t("fpAlreadyPaid")}
        </label>
        {paid && <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputCls} />}
        {!paid && (
          <label className="flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} className="h-3.5 w-3.5" />
            {t("fpSendNow")}
          </label>
        )}
      </div>
      {kind === "lump_sum" && <p className="text-xs text-muted">{t("fpLumpSumHint")}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !amount}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {t("fpCreate")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink-2">
            {t("cancel")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      {sentTo && <p className="text-xs text-muted">{t("fpSentTo", { email: sentTo })}</p>}
    </div>
  );
}

/** Round 49: invoice number + PDF/Word download + when it was emailed. */
export function InvoiceLinks({ payment }: { payment: FranchisePayment }) {
  const { t } = useLocale();
  const base = `/api/franchise/invoices/${payment.id}`;
  const d = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      <span className="flex flex-wrap items-center gap-x-2">
        {payment.invoice_number && <span className="font-medium text-ink-2">№ {payment.invoice_number}</span>}
        <a href={`${base}/pdf?inline=1`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          PDF
        </a>
        <a href={`${base}/docx`} className="text-accent hover:underline">
          Word
        </a>
      </span>
      {(payment.sent_at || payment.last_reminder_at) && (
        <span className="text-muted">
          {payment.last_reminder_at
            ? t("fpRemindedOn", { date: d(payment.last_reminder_at) })
            : t("fpSentOn", { date: d(payment.sent_at!) })}
        </span>
      )}
    </span>
  );
}

export function PaymentStatusPill({ payment }: { payment: FranchisePayment }) {
  const { t } = useLocale();
  const overdue = isOverdue(payment, todayIso());
  const cls =
    payment.status === "paid"
      ? "bg-surface-3 text-foreground"
      : payment.status === "cancelled"
        ? "bg-surface-2 text-muted line-through"
        : overdue
          ? "bg-accent/10 text-accent-strong"
          : "bg-warn-soft text-warn";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {overdue ? t("fpStatusOverdue") : t(statusLabelKey(payment.status))}
    </span>
  );
}

export function paymentKindText(p: FranchisePayment, t: (k: string) => string, locale: string): string {
  const base = t(kindLabelKey(p.kind));
  if (p.kind === "royalty" && p.period_month) {
    const m = new Date(`${p.period_month}T00:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${base} · ${m}`;
  }
  return base;
}

/** Row-level actions: mark paid (with date), cancel, delete. */
export function PaymentActions({
  payment,
  onChanged,
}: {
  payment: FranchisePayment;
  onChanged: (stage?: FranchiseStageId) => void;
}) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);
  const [paidDate, setPaidDate] = useState(todayIso());

  const run = (fn: () => Promise<{ error: string | null; stage?: FranchiseStageId }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) alertError(t(r.error));
      else {
        setPaying(false);
        onChanged(r.stage);
      }
    });

  if (paying) {
    return (
      <span className="flex items-center gap-1.5">
        <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={`${inputCls} py-1 text-xs`} />
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setFranchisePaymentStatus(payment.id, "paid", paidDate))}
          className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          OK
        </button>
        <button type="button" onClick={() => setPaying(false)} className="text-xs text-muted">
          ×
        </button>
      </span>
    );
  }

  const sendLabel = payment.sent_at ? t("fpRemind") : t("fpSend");
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {payment.status === "invoiced" && (
        <button
          type="button"
          disabled={pending}
          title={t("fpSendHint")}
          onClick={() => {
            if (confirm(payment.sent_at ? t("fpRemindConfirm") : t("fpSendConfirm")))
              run(() => sendFranchiseInvoice(payment.id, !!payment.sent_at));
          }}
          className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {sendLabel}
        </button>
      )}
      {payment.status === "invoiced" && (
        <button
          type="button"
          onClick={() => setPaying(true)}
          className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("fpMarkPaid")}
        </button>
      )}
      {payment.status !== "invoiced" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setFranchisePaymentStatus(payment.id, "invoiced"))}
          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-ink-2"
        >
          {t("fpReopen")}
        </button>
      )}
      {payment.status === "invoiced" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setFranchisePaymentStatus(payment.id, "cancelled"))}
          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-ink-2"
        >
          {t("fpCancelInvoice")}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(t("fpDeleteConfirm"))) run(() => deleteFranchisePayment(payment.id));
        }}
        className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-accent-strong"
      >
        {t("delete")}
      </button>
    </span>
  );
}

function alertError(msg: string) {
  // Rare path (RLS/network error) — a plain alert keeps row actions compact.
  if (typeof window !== "undefined") window.alert(msg);
}

export { formatUsd };
