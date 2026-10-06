"use client";

import { useMemo, useState } from "react";
import { STATUSES, statusLabel, statusPillClasses } from "@/lib/payments";
import {
  currentMonthKey,
  formatPctDelta,
  inPeriod,
  monthKeyOf,
  monthLabel,
  pctChange,
  periodLabel,
  shiftMonthKey,
  type Period,
} from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import { localOf, sumLocal, type LocalAmount } from "@/lib/currency";
import Avatar from "@/components/ui/Avatar";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { MemberOption, Payment } from "./types";
import type { PackageSaleRow } from "@/app/packages/actions";
import NewPaymentModal from "./NewPaymentModal";
import EditPaymentModal from "./EditPaymentModal";
import PaymentLinkModal from "./PaymentLinkModal";
import PackageSaleDetailModal from "./PackageSaleDetailModal";

/** Month/year button options for the Оплаты page's own period picker —
 * same idea as monthsWithActivity/yearsWithActivity in lib/dashboard, just
 * built from payments alone rather than leads/enrollments/payments
 * together (this page has no lead/enrollment rows to draw on). */
function paymentMonthOptions(payments: Payment[], limit = 6): string[] {
  const set = new Set<string>([currentMonthKey()]);
  payments.forEach((p) => set.add(monthKeyOf(p.paid_date)));
  return [...set].sort().reverse().slice(0, limit);
}

function paymentYearOptions(payments: Payment[]): string[] {
  const set = new Set<string>([currentMonthKey().slice(0, 4)]);
  payments.forEach((p) => set.add(p.paid_date.slice(0, 4)));
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
  products,
  cohorts,
  canEdit,
  stripeEnabled,
  packageSales,
}: {
  initialPayments: Payment[];
  memberOptions: MemberOption[];
  /** Round 53 — for «новый поток» in the new-payment form. */
  products: { id: string; name: string; price: number }[];
  cohorts: { product_id: string; start_date: string }[];
  canEdit: boolean;
  stripeEnabled: boolean;
  /** "Продажа пакета" (round 46/47) — each is ONE real payment shown as a
   * single line here (see app/packages/actions.ts); its own total_price is
   * never in `initialPayments` and never counted in the tiles below — only
   * the per-course payments rows created as потоки get assigned are (they
   * show up in initialPayments like any other payment, automatically). */
  packageSales: PackageSaleRow[];
}) {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<"all" | "prepay" | "partial" | "package">("all");
  const [period, setPeriod] = useState<Period>({ mode: "month", month: currentMonthKey() });
  const [showNew, setShowNew] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const isHq = !canEdit;

  // 2 Oct 2026 — «Оплаты — это движение денежных средств!» (Anastasiia).
  // This page is now CASH: every row and tile is dated by when the money
  // came in (paid_date), not by the поток start. The course-start
  // attribution («выручка по оказанной услуге») stays on Главная.
  // A package is one cash payment here; the shares that get moved onto
  // потоки when one is assigned (payments.package_sale_id) are revenue
  // records for Главная only — they're not listed here again.
  const cashPayments = useMemo(() => initialPayments.filter((p) => !p.package_sale_id), [initialPayments]);

  const monthOptions = useMemo(
    () => paymentMonthOptions([...cashPayments, ...packageSales.map((k) => ({ paid_date: k.paid_date }) as Payment)]),
    [cashPayments, packageSales]
  );
  const yearOptions = useMemo(
    () => paymentYearOptions([...cashPayments, ...packageSales.map((k) => ({ paid_date: k.paid_date }) as Payment)]),
    [cashPayments, packageSales]
  );

  // «Предоплата» = paid before her поток started; «Частичная» = marked as a
  // partial payment (рассрочка); «Пакеты» = package sales only.
  const isPrepay = (p: Payment) => !!p.enrollment?.start_date && p.paid_date < p.enrollment.start_date;

  const filtered = useMemo(() => {
    if (kind === "package") return [];
    const byStatus = status === "all" ? cashPayments : cashPayments.filter((p) => p.status === status);
    return byStatus
      .filter((p) => inPeriod(period, p.paid_date))
      .filter((p) => (kind === "prepay" ? isPrepay(p) : kind === "partial" ? !!p.is_partial : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashPayments, status, period, kind]);

  // A package sale is always "already paid" money (it's a lump sum received
  // up front — see app/packages/actions.ts), so it only shows up under the
  // "Оплачено"/"Все статусы" filters, never "Ожидает"/"Возврат". Attributed
  // by its own paid_date (not per-course — the whole point is that the
  // per-course потоки aren't all known at the time it's paid).
  const filteredPackages = useMemo(() => {
    if (status !== "all" && status !== "paid") return [];
    if (kind === "partial") return [];
    return packageSales.filter((pkg) => inPeriod(period, pkg.paid_date));
  }, [packageSales, status, period, kind]);

  const selectedPackage = packageSales.find((p) => p.id === selectedPackageId) ?? null;

  // The first three headline tiles deliberately read from ALL payments (only
  // scoped by the period picker, not the status dropdown below) — same
  // reasoning as the Leads page's top KPIs (see LeadsBoard): a filter
  // changes what the table shows, not the club's real numbers for the
  // period. Tile 3 stays a genuine all-time total on purpose (clearly
  // labelled as such — unlike the home dashboard, one lifetime figure next
  // to period figures isn't confusing as long as it's honest about what it is).
  // Cash in = paid payments (not package shares) + package sales, by paid_date.
  const cashIn = useMemo(
    () => [
      ...cashPayments
        .filter((p) => p.status === "paid")
        .map((p) => ({ date: p.paid_date, amount: Number(p.amount), local: localOf(p.amount_local, p.local_currency) })),
      ...packageSales.map((k) => ({
        date: k.paid_date,
        amount: Number(k.total_price),
        local: localOf(k.total_price_local, k.local_currency),
      })),
    ],
    [cashPayments, packageSales]
  );
  const pendingPayments = useMemo(() => cashPayments.filter((p) => p.status === "pending"), [cashPayments]);
  const collectedInPeriod = useMemo(
    () => cashIn.filter((c) => inPeriod(period, c.date)).reduce((sum, c) => sum + c.amount, 0),
    [cashIn, period]
  );
  const collectedDelta = useMemo(() => {
    if (period.mode !== "month") return null;
    const previousMonth = shiftMonthKey(period.month, -1);
    const collectedPrevious = cashIn
      .filter((c) => monthKeyOf(c.date) === previousMonth)
      .reduce((sum, c) => sum + c.amount, 0);
    return pctChange(collectedInPeriod, collectedPrevious);
  }, [cashIn, period, collectedInPeriod]);
  const collectedAllTime = useMemo(() => cashIn.reduce((sum, c) => sum + c.amount, 0), [cashIn]);
  // Round 56: exact club-currency totals (sum of what was typed), when every row has one.
  const collectedInPeriodLocal = useMemo(
    () => sumLocal(cashIn.filter((c) => inPeriod(period, c.date)).map((c) => c.local as LocalAmount | null)),
    [cashIn, period]
  );
  const collectedAllTimeLocal = useMemo(() => sumLocal(cashIn.map((c) => c.local as LocalAmount | null)), [cashIn]);
  const pendingInPeriod = useMemo(
    () => pendingPayments.filter((p) => inPeriod(period, p.paid_date)),
    [pendingPayments, period]
  );
  const totalExpected = useMemo(() => pendingInPeriod.reduce((sum, p) => sum + Number(p.amount), 0), [pendingInPeriod]);
  const totalExpectedLocal = useMemo(
    () => sumLocal(pendingInPeriod.map((p) => localOf(p.amount_local, p.local_currency))),
    [pendingInPeriod]
  );

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
            <Money amountEur={collectedInPeriod} local={collectedInPeriodLocal} />
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
            <Money amountEur={totalExpected} local={totalExpectedLocal} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("awaitingCount", { n: pendingInPeriod.length })}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("tileCollectedAllTime")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Money amountEur={collectedAllTime} local={collectedAllTimeLocal} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("deltaAllTime")}</div>
        </div>
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("tileTotalRecords")}</div>
          <div
            className="mt-1 font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {filtered.length + filteredPackages.length}
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
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("payKindAll")}</option>
          <option value="prepay">{t("payKindPrepay")}</option>
          <option value="partial">{t("payKindPartial")}</option>
          <option value="package">{t("payKindPackage")}</option>
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

      {filtered.length === 0 && filteredPackages.length === 0 ? (
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
              {/* Package sales (round 46/47) render as one row each, sorted
                  into the same list by date as real payments — see
                  filteredPackages above for why they're never revenue-
                  counted independently. */}
              {[
                ...filtered.map((p) => ({ kind: "payment" as const, date: p.paid_date, payment: p })),
                ...filteredPackages.map((pkg) => ({ kind: "package" as const, date: pkg.paid_date, pkg })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((row) =>
                  row.kind === "package" ? (
                    <tr
                      key={`pkg-${row.pkg.id}`}
                      onClick={() => setSelectedPackageId(row.pkg.id)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.pkg.member_name ?? "?"} size={28} />
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{row.pkg.member_name ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      {isHq && <td className="px-4 py-3 text-muted">{row.pkg.partner_name ?? "—"}</td>}
                      <td className="px-4 py-3 text-muted">{row.pkg.label}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-ink-2">
                          {t("packageBadgeLabel")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{row.pkg.paid_date}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        <Money amountEur={row.pkg.total_price} local={localOf(row.pkg.total_price_local, row.pkg.local_currency)} />
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={row.payment.id}
                      onClick={() => setSelectedId(row.payment.id)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.payment.member_name ?? row.payment.lead_name ?? "?"} size={28} />
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">
                              {row.payment.member_name ??
                                row.payment.lead_name ??
                                (row.payment.dsk_order_id ? t("paymentDskOnline") : "—")}
                            </div>
                            {!row.payment.member_name && row.payment.lead_name && !row.payment.dsk_order_id && (
                              <div className="text-xs text-muted">{t("paymentFromLeadOnly")}</div>
                            )}
                            {/* Round 58 — a bank payment with no participant: «Не привязана»
                                (the club also gets a task on the lead). */}
                            {!row.payment.member_name && row.payment.dsk_order_id && (
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">
                                  {t("badgePaymentUnlinked")}
                                </span>
                                <span className="text-warn">{t("paymentDskUnlinked")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {isHq && <td className="px-4 py-3 text-muted">{row.payment.partner_name ?? "—"}</td>}
                      <td className="px-4 py-3 text-muted">{row.payment.product_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClasses(row.payment.status ?? "paid")}`}
                        >
                          {statusLabel(row.payment.status ?? "paid", locale)}
                        </span>
                        {row.payment.is_partial && (
                          <span className="ml-1.5 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                            {t("tagPartial")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{row.payment.paid_date}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        <Money amountEur={row.payment.amount} local={localOf(row.payment.amount_local, row.payment.local_currency)} />
                      </td>
                    </tr>
                  )
                )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPaymentModal
          members={memberOptions}
          products={products}
          cohorts={cohorts}
          onClose={() => setShowNew(false)}
        />}
      {showLink && <PaymentLinkModal members={memberOptions} onClose={() => setShowLink(false)} />}
      {selectedPackage && <PackageSaleDetailModal pkg={selectedPackage} onClose={() => setSelectedPackageId(null)} />}
      {selected && (
        <EditPaymentModal
          key={selected.id}
          payment={selected}
          enrollmentOptions={memberOptions.filter(
            (m) => m.enrollmentId && (!selected.member_id || m.memberId === selected.member_id)
          )}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
