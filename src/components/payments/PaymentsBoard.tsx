"use client";

import { useMemo, useState } from "react";
import { STATUSES, statusLabel, statusPillClasses } from "@/lib/payments";
import { currentMonthKey, formatPctDelta, monthKeyOf, monthLabel, pctChange, previousMonthKey } from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import Avatar from "@/components/ui/Avatar";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { MemberOption, Payment } from "./types";
import NewPaymentModal from "./NewPaymentModal";
import EditPaymentModal from "./EditPaymentModal";
import PaymentLinkModal from "./PaymentLinkModal";

export default function PaymentsBoard({
  initialPayments,
  memberOptions,
  canEdit,
  stripeEnabled,
}: {
  initialPayments: Payment[];
  memberOptions: MemberOption[];
  canEdit: boolean;
  stripeEnabled: boolean;
}) {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isHq = !canEdit;

  const filtered = useMemo(() => {
    if (status === "all") return initialPayments;
    return initialPayments.filter((p) => p.status === status);
  }, [initialPayments, status]);

  // The four headline tiles deliberately read from ALL payments, not the
  // status-filtered `filtered` list below — same reasoning as the Leads
  // page's top KPIs (see LeadsBoard): a filter changes what the table
  // shows, not the club's real totals.
  const thisMonth = currentMonthKey();
  const prevMonth = previousMonthKey();
  const paidPayments = useMemo(() => initialPayments.filter((p) => p.status === "paid"), [initialPayments]);
  const collectedThisMonth = useMemo(
    () => paidPayments.filter((p) => monthKeyOf(p.paid_date) === thisMonth).reduce((sum, p) => sum + Number(p.amount), 0),
    [paidPayments, thisMonth]
  );
  const collectedPrevMonth = useMemo(
    () => paidPayments.filter((p) => monthKeyOf(p.paid_date) === prevMonth).reduce((sum, p) => sum + Number(p.amount), 0),
    [paidPayments, prevMonth]
  );
  const collectedAllTime = useMemo(() => paidPayments.reduce((sum, p) => sum + Number(p.amount), 0), [paidPayments]);
  const pendingPayments = useMemo(() => initialPayments.filter((p) => p.status === "pending"), [initialPayments]);
  const totalExpected = useMemo(() => pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0), [pendingPayments]);

  const selected = initialPayments.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">
            {t("tileCollectedMonth", { month: monthLabel(thisMonth, locale) })}
          </div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={collectedThisMonth} />
          </div>
          <div className="mt-1 text-xs text-muted">{formatPctDelta(pctChange(collectedThisMonth, collectedPrevMonth), locale)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("kExpected")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={totalExpected} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("awaitingCount", { n: pendingPayments.length })}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statCollectedTotal")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={collectedAllTime} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("deltaAllTime")}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("tileTotalRecords")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {filtered.length}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {statusLabel(s.id, locale)}
            </option>
          ))}
        </select>

        {canEdit && stripeEnabled && (
          <button
            onClick={() => setShowLink(true)}
            className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("btnAddPaymentLinkShort")}
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className={`rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background ${stripeEnabled ? "" : "ml-auto"}`}
          >
            {t("btnAddPaymentShort")}
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("hqReadOnlyPaymentsBanner")}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoPaymentsFiltered")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colMember")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colCourse")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colDate")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.member_name ?? p.lead_name ?? "?"} size={28} />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{p.member_name ?? p.lead_name ?? "—"}</div>
                        {!p.member_name && p.lead_name && (
                          <div className="text-xs text-muted">{t("paymentFromLeadOnly")}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  {isHq && <td className="px-4 py-3 text-muted">{p.partner_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted">{p.product_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClasses(p.status ?? "paid")}`}>
                      {statusLabel(p.status ?? "paid", locale)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.paid_date}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    <Money amountEur={p.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPaymentModal members={memberOptions} onClose={() => setShowNew(false)} />}
      {showLink && <PaymentLinkModal members={memberOptions} onClose={() => setShowLink(false)} />}
      {selected && (
        <EditPaymentModal
          key={selected.id}
          payment={selected}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
