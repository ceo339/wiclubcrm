"use client";

import { useMemo, useState } from "react";
import { STATUSES, statusLabel, statusPillClasses } from "@/lib/payments";
import {
  currentMonthKey,
  formatPctDelta,
  inPeriod,
  monthKeyOf,
  monthLabel,
  paymentAttributionDate,
  pctChange,
  periodLabel,
  shiftMonthKey,
  type Period,
} from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import Avatar from "@/components/ui/Avatar";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { MemberOption, Payment } from "./types";
import NewPaymentModal from "./NewPaymentModal";
import EditPaymentModal from "./EditPaymentModal";
import PaymentLinkModal from "./PaymentLinkModal";

/** Month/year button options for the Оплаты page's own period picker —
 * same idea as monthsWithActivity/yearsWithActivity in lib/dashboard, just
 * built from payments alone rather than leads/enrollments/payments
 * together (this page has no lead/enrollment rows to draw on). */
function paymentMonthOptions(payments: Payment[], limit = 6): string[] {
  const set = new Set<string>([currentMonthKey()]);
  payments.forEach((p) => set.add(monthKeyOf(paymentAttributionDate(p))));
  return [...set].sort().reverse().slice(0, limit);
}

function paymentYearOptions(payments: Payment[]): string[] {
  const set = new Set<string>([currentMonthKey().slice(0, 4)]);
  payments.forEach((p) => set.add(paymentAttributionDate(p).slice(0, 4)));
  return [...set].sort().reverse();
}

/** Compact period picker for the Оплаты page — "оплаты должны быть тоже по
 * периодам" (Anastasiia, 11 сен 2026). Purely client-side (no URL, unlike
 * the dashboard's PeriodFilter) since this board already manages its own
 * status filter the same way. */
function PaymentPeriodTabs({
  period,
  onChange,
  monthOptions,
  yearOptions,
}: {
  period: Period;
  onChange: (period: Period) => void;
  monthOptions: string[];
  yearOptions: string[];
}) {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<"month" | "year">(period.mode === "year" ? "year" : "month");
  const tabOptions = tab === "month" ? monthOptions : yearOptions;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        {(["month", "year"] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === tb ? "bg-surface-2 text-foreground" : "text-muted hover:text-ink-2"
            }`}
          >
            {t(tb === "month" ? "periodTabMonths" : "periodTabYear")}
          </button>
        ))}
      </div>
      {tabOptions.map((key) => {
        const isActive = tab === "month" ? period.mode === "month" && period.month === key : period.mode === "year" && period.year === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(tab === "month" ? { mode: "month", month: key } : { mode: "year", year: key })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              isActive ? "border-foreground bg-foreground text-background" : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            {tab === "month" ? monthLabel(key, locale) : key}
          </button>
        );
      })}
    </div>
  );
}

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
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });
  const [showNew, setShowNew] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isHq = !canEdit;

  const monthOptions = useMemo(() => paymentMonthOptions(initialPayments), [initialPayments]);
  const yearOptions = useMemo(() => paymentYearOptions(initialPayments), [initialPayments]);

  // "оплаты должны быть тоже по периодам" (Anastasiia, 11 сен 2026) — the
  // table (and the tiles below, independent of the status dropdown) now
  // follow the same course-start attribution as the rest of the dashboard,
  // not just the status filter.
  const filtered = useMemo(() => {
    const byStatus = status === "all" ? initialPayments : initialPayments.filter((p) => p.status === status);
    return byStatus.filter((p) => inPeriod(period, paymentAttributionDate(p)));
  }, [initialPayments, status, period]);

  // The first three headline tiles deliberately read from ALL payments (only
  // scoped by the period picker, not the status dropdown below) — same
  // reasoning as the Leads page's top KPIs (see LeadsBoard): a filter
  // changes what the table shows, not the club's real numbers for the
  // period. Tile 3 stays a genuine all-time total on purpose (clearly
  // labelled as such — unlike the home dashboard, one lifetime figure next
  // to period figures isn't confusing as long as it's honest about what it is).
  const paidPayments = useMemo(() => initialPayments.filter((p) => p.status === "paid"), [initialPayments]);
  const pendingPayments = useMemo(() => initialPayments.filter((p) => p.status === "pending"), [initialPayments]);
  const collectedInPeriod = useMemo(
    () => paidPayments.filter((p) => inPeriod(period, paymentAttributionDate(p))).reduce((sum, p) => sum + Number(p.amount), 0),
    [paidPayments, period]
  );
  const collectedDelta = useMemo(() => {
    if (period.mode !== "month") return null;
    const previousMonth = shiftMonthKey(period.month, -1);
    const collectedPrevious = paidPayments
      .filter((p) => monthKeyOf(paymentAttributionDate(p)) === previousMonth)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return pctChange(collectedInPeriod, collectedPrevious);
  }, [paidPayments, period, collectedInPeriod]);
  const collectedAllTime = useMemo(() => paidPayments.reduce((sum, p) => sum + Number(p.amount), 0), [paidPayments]);
  const pendingInPeriod = useMemo(
    () => pendingPayments.filter((p) => inPeriod(period, paymentAttributionDate(p))),
    [pendingPayments, period]
  );
  const totalExpected = useMemo(() => pendingInPeriod.reduce((sum, p) => sum + Number(p.amount), 0), [pendingInPeriod]);

  const selected = initialPayments.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">
            {t("tileCollectedPeriod", { period: periodLabel(period, locale) })}
          </div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={collectedInPeriod} />
          </div>
          <div className="mt-1 text-xs text-muted">
            {period.mode === "month" ? formatPctDelta(collectedDelta, locale) : t("deltaForPeriod")}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("kExpected")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={totalExpected} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("awaitingCount", { n: pendingInPeriod.length })}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("tileCollectedAllTime")}</div>
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

      <PaymentPeriodTabs period={period} onChange={setPeriod} monthOptions={monthOptions} yearOptions={yearOptions} />

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
