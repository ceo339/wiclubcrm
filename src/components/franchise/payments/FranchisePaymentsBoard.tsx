"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { FranchisePayment } from "@/app/franchise/payments/actions";
import { FRANCHISE_PAYMENT_KINDS, FRANCHISE_PAYMENT_STATUSES, isOverdue } from "@/lib/franchisePayments";
import { FRANCHISE_TERMINAL_STAGES, type FranchiseStageId } from "@/lib/franchise";
import type { FranchiseCandidate } from "../types";
import CandidateDetailModal from "../CandidateDetailModal";
import { FranchisePaymentForm, InvoiceLinks, PaymentActions, PaymentStatusPill, formatUsd, paymentKindText } from "./PaymentParts";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function FranchisePaymentsBoard({
  payments,
  candidates,
  canEdit,
  canEditCandidate,
  initialStatus = "all",
}: {
  payments: FranchisePayment[];
  candidates: FranchiseCandidate[];
  /** May create/send/mark invoices (HQ, МПП, финдиректор). */
  canEdit: boolean;
  /** May edit the pipeline card itself (HQ, МПП) — the finance director
   * opens it read-only. */
  canEditCandidate: boolean;
  initialStatus?: string;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const today = todayIso();
  const month = today.slice(0, 7);

  const live = payments.filter((p) => p.status !== "cancelled");
  const sum = (list: FranchisePayment[]) => list.reduce((s, p) => s + Number(p.amount), 0);
  const paidThisMonth = sum(live.filter((p) => p.status === "paid" && (p.paid_date ?? "").startsWith(month)));
  const paidTotal = sum(live.filter((p) => p.status === "paid"));
  const dueList = live.filter((p) => p.status === "invoiced");
  const overdueList = dueList.filter((p) => isOverdue(p, today));

  const q = search.trim().toLowerCase();
  const rows = payments.filter((p) => {
    if (kind !== "all" && p.kind !== kind) return false;
    if (status === "overdue" ? !isOverdue(p, today) : status !== "all" && p.status !== status) return false;
    if (q) {
      const c = byId.get(p.candidate_id);
      const hay = `${c?.name ?? ""} ${c?.billing_name ?? ""} ${c?.target_city ?? ""} ${p.note ?? ""} ${p.invoice_number ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Picker: everyone who isn't declined/paused — contract-stage and active
  // franchisees first, so the usual targets sit at the top.
  const candidateOptions = candidates
    .filter((c) => !FRANCHISE_TERMINAL_STAGES.includes(c.stage as FranchiseStageId))
    .map((c) => ({ id: c.id, label: [c.name, c.target_city].filter(Boolean).join(" — ") }));

  const refresh = () => {
    setAdding(false);
    router.refresh();
  };
  const openCandidate = openId ? byId.get(openId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t("fpTilePaidMonth")} value={formatUsd(paidThisMonth, locale)} />
        <Tile label={t("fpTilePaidTotal")} value={formatUsd(paidTotal, locale)} />
        <Tile label={t("fpTileDue")} value={formatUsd(sum(dueList), locale)} hint={t("fpTileCount", { n: dueList.length })} />
        <Tile
          label={t("fpTileOverdue")}
          value={formatUsd(sum(overdueList), locale)}
          hint={t("fpTileCount", { n: overdueList.length })}
          warn={overdueList.length > 0}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("fpSearch")}
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm md:max-w-xs"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm">
          <option value="all">{t("fpAllKinds")}</option>
          {FRANCHISE_PAYMENT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {t(k.labelKey)}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm">
          <option value="all">{t("fpAllStatuses")}</option>
          {FRANCHISE_PAYMENT_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.labelKey)}
            </option>
          ))}
          <option value="overdue">{t("fpStatusOverdue")}</option>
        </select>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            + {t("fpNewInvoice")}
          </button>
        )}
      </div>

      {adding && (
        <div className="max-w-xl">
          <FranchisePaymentForm candidateOptions={candidateOptions} onDone={refresh} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">{t("fpColInvoiceDate")}</th>
              <th className="px-4 py-2 font-medium">{t("fpColInvoice")}</th>
              <th className="px-4 py-2 font-medium">{t("fpColFranchisee")}</th>
              <th className="px-4 py-2 font-medium">{t("fpFieldKind")}</th>
              <th className="px-4 py-2 font-medium">{t("fpFieldAmount")}</th>
              <th className="px-4 py-2 font-medium">{t("fpFieldDueDate")}</th>
              <th className="px-4 py-2 font-medium">{t("fpColStatus")}</th>
              {canEdit && <th className="px-4 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted">
                  {t("fpEmpty")}
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const c = byId.get(p.candidate_id);
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-4 py-2 whitespace-nowrap">{p.invoice_date}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <InvoiceLinks payment={p} />
                    </td>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setOpenId(p.candidate_id)} className="text-left font-medium text-foreground hover:underline">
                        {c?.name ?? "—"}
                      </button>
                      {c?.target_city && <div className="text-xs text-muted">{c.target_city}</div>}
                    </td>
                    <td className="px-4 py-2">
                      {paymentKindText(p, t, locale)}
                      {p.note && <div className="text-xs text-muted">{p.note}</div>}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-semibold">{formatUsd(Number(p.amount), locale)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-2">
                      {p.status === "paid" && p.paid_date ? `${t("fpPaidOn")} ${p.paid_date}` : (p.due_date ?? "—")}
                    </td>
                    <td className="px-4 py-2">
                      <PaymentStatusPill payment={p} />
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2">
                        <PaymentActions payment={p} onChanged={() => router.refresh()} />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {openCandidate && (
        <CandidateDetailModal
          candidate={openCandidate}
          canEdit={canEditCandidate}
          canBill={canEdit}
          onClose={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 font-display text-[26px] leading-[1.05] tracking-[-0.02em] ${warn ? "text-accent-strong" : "text-foreground"}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
