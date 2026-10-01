"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { FranchisePayment } from "@/app/franchise/payments/actions";
import { currentMonthKey, inPeriod, monthLabel, periodLabel, type Period } from "@/lib/dashboard";
import { formatUsd, netPaidOf, refundedOf } from "@/lib/franchisePayments";

/**
 * Round 50 — «Доходы от франчайзи»: обучение ШМ (was паушальный взнос until
 * 1 Oct 2026 — the network has none) and royalties, each for
 * the selected period and for all time, plus royalties as a monthly bar
 * chart. Only paid invoices count as income; open ones are shown separately
 * («ожидается»). Used on «Оплаты франчайзи» (own period picker) and on the
 * franchise Главная (driven by the dashboard's period switcher).
 *
 * Refunds (round 51) are subtracted: from «за всё время» directly, and from
 * a period by the refund's own date (money went back in that period).
 *
 * Which date decides the period:
 *   • обучение ШМ — paid_date (when the money came in);
 *   • роялти — period_month (the month the royalty is FOR, as on the
 *     invoice), falling back to paid_date / invoice_date if it's missing.
 */

type Props = {
  payments: FranchisePayment[];
  /** When given, the widget follows this period and hides its own picker. */
  period?: Period;
};

/** "2026-09" + (-1) → "2026-08" — pure arithmetic, no Date/timezone. */
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Обучение ШМ counts in the month the money came in (open invoices: the
 * invoice month). */
function trainingMonth(p: FranchisePayment): string {
  return (p.paid_date ?? p.invoice_date).slice(0, 7);
}

function royaltyMonth(p: FranchisePayment): string {
  return (p.period_month ?? p.paid_date ?? p.invoice_date).slice(0, 7);
}

export default function FranchiseRevenueWidget({ payments, period: externalPeriod }: Props) {
  const { locale, t } = useLocale();
  const thisMonth = currentMonthKey();
  const [ownPeriod, setOwnPeriod] = useState<Period>({ mode: "month", month: thisMonth });
  const period = externalPeriod ?? ownPeriod;

  const stats = useMemo(() => {
    const live = payments.filter((p) => p.status !== "cancelled");
    const paid = live.filter((p) => p.status === "paid");
    const open = live.filter((p) => p.status === "invoiced");
    const sum = (list: FranchisePayment[]) => list.reduce((s, p) => s + Number(p.amount), 0);

    const trainPaid = paid.filter((p) => p.kind === "training");
    const royPaid = paid.filter((p) => p.kind === "royalty");
    const trainInPeriod = trainPaid.filter((p) => p.paid_date && inPeriod(period, p.paid_date));
    const royInPeriod = royPaid.filter((p) => inPeriod(period, `${royaltyMonth(p)}-01`));
    const refundsInPeriod = (list: FranchisePayment[]) =>
      list.filter((p) => p.refund_date && inPeriod(period, p.refund_date)).reduce((s, p) => s + refundedOf(p), 0);
    const net = (list: FranchisePayment[]) => list.reduce((s, p) => s + netPaidOf(p), 0);
    const trainRefundPeriod = refundsInPeriod(trainPaid);
    const royRefundPeriod = refundsInPeriod(royPaid);

    return {
      trainPeriod: sum(trainInPeriod) - trainRefundPeriod,
      trainPeriodCount: trainInPeriod.length,
      trainRefundPeriod,
      trainAll: net(trainPaid),
      trainOpen: sum(open.filter((p) => p.kind === "training")),
      royPeriod: sum(royInPeriod) - royRefundPeriod,
      royRefundPeriod,
      royAll: net(royPaid),
      royOpen: sum(open.filter((p) => p.kind === "royalty")),
    };
  }, [payments, period]);

  // Monthly charts (1 Oct 2026: «рядом 2 диаграммы — обучение и роялти»).
  // Same 12-month window for both so the bars line up month for month.
  const charts = useMemo(() => {
    const live = payments.filter((p) => p.status !== "cancelled");
    const roy = live.filter((p) => p.kind === "royalty");
    const train = live.filter((p) => p.kind === "training");
    const latest = [...roy.map(royaltyMonth), ...train.map(trainingMonth)].reduce(
      (m, k) => (k > m ? k : m),
      thisMonth
    );
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(latest, i - 11));
    const build = (list: FranchisePayment[], monthOf: (p: FranchisePayment) => string) => {
      const byMonth = new Map(months.map((m) => [m, { paid: 0, open: 0 }]));
      for (const p of list) {
        const slot = byMonth.get(monthOf(p));
        if (!slot) continue;
        if (p.status === "paid") slot.paid += netPaidOf(p);
        else slot.open += Number(p.amount);
      }
      return months.map((m) => ({ month: m, ...byMonth.get(m)! }));
    };
    const royRows = build(roy, royaltyMonth);
    const trainRows = build(train, trainingMonth);
    // Trim leading months that are empty in BOTH charts (min 6 shown).
    const firstOf = (rows: { paid: number; open: number }[]) => rows.findIndex((r) => r.paid + r.open > 0);
    const firsts = [firstOf(royRows), firstOf(trainRows)].filter((i) => i >= 0);
    const start = firsts.length ? Math.min(Math.min(...firsts), months.length - 6) : months.length;
    const cut = (rows: typeof royRows) => {
      const visible = rows.slice(start);
      return { rows: visible, max: Math.max(1, ...visible.map((r) => r.paid + r.open)) };
    };
    return { royalty: cut(royRows), training: cut(trainRows) };
  }, [payments, thisMonth]);

  const presets: { key: string; label: string; period: Period }[] = [
    { key: "this", label: t("frPeriodThisMonth"), period: { mode: "month", month: thisMonth } },
    { key: "prev", label: t("frPeriodPrevMonth"), period: { mode: "month", month: shiftMonth(thisMonth, -1) } },
    { key: "year", label: t("frPeriodThisYear"), period: { mode: "year", year: thisMonth.slice(0, 4) } },
  ];
  const samePeriod = (a: Period, b: Period) => JSON.stringify(a) === JSON.stringify(b);
  const usd = (n: number) => formatUsd(n, locale);

  return (
    <section className="rounded-xl border border-border bg-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("frHeading")}</h2>
          <p className="text-xs text-muted">
            {t("frPeriod")}: {periodLabel(period, locale)}
          </p>
        </div>
        {!externalPeriod && (
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setOwnPeriod(p.period)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  samePeriod(period, p.period) ? "bg-foreground text-background" : "bg-surface-2 text-ink-2 hover:bg-surface-3"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <RevenueCard
            title={t("fpKindTraining")}
            period={usd(stats.trainPeriod)}
            periodHint={stats.trainPeriodCount ? t("fpTileCount", { n: stats.trainPeriodCount }) : null}
            refunds={stats.trainRefundPeriod > 0 ? usd(stats.trainRefundPeriod) : null}
            all={usd(stats.trainAll)}
            open={stats.trainOpen > 0 ? usd(stats.trainOpen) : null}
          />
          <MonthlyBars
            title={t("frTrainingByMonth")}
            emptyText={t("frNoTraining")}
            chart={charts.training}
            period={period}
          />
        </div>
        <div className="flex flex-col gap-4">
          <RevenueCard
            title={t("fpKindRoyalty")}
            period={usd(stats.royPeriod)}
            periodHint={null}
            refunds={stats.royRefundPeriod > 0 ? usd(stats.royRefundPeriod) : null}
            all={usd(stats.royAll)}
            open={stats.royOpen > 0 ? usd(stats.royOpen) : null}
          />
          <MonthlyBars
            title={t("frRoyaltyByMonth")}
            emptyText={t("frNoRoyalties")}
            chart={charts.royalty}
            period={period}
          />
        </div>
      </div>
    </section>
  );
}

type ChartData = { rows: { month: string; paid: number; open: number }[]; max: number };

function MonthlyBars({
  title,
  emptyText,
  chart,
  period,
}: {
  title: string;
  emptyText: string;
  chart: ChartData;
  period: Period;
}) {
  const { locale, t } = useLocale();
  const usd = (n: number) => formatUsd(n, locale);
  const hasData = chart.rows.some((r) => r.paid + r.open > 0);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> {t("fpStatusPaid")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent/30" /> {t("frExpected")}
          </span>
        </div>
      </div>
      {!hasData ? (
        <p className="mt-3 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="mt-4 flex items-end gap-1.5">
          {chart.rows.map((r) => {
            const total = r.paid + r.open;
            const selected = inPeriod(period, `${r.month}-01`);
            return (
              <div key={r.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="h-4 whitespace-nowrap text-[10px] font-medium text-foreground">
                  {total > 0 ? usd(total).replace(/[,.]00(?=\D*$)/, "") : ""}
                </div>
                <div
                  className="flex h-28 w-full max-w-9 flex-col justify-end"
                  title={`${monthLabel(r.month, locale)}: ${t("fpStatusPaid").toLowerCase()} ${usd(r.paid)}${
                    r.open ? `, ${t("frExpected").toLowerCase()} ${usd(r.open)}` : ""
                  }`}
                >
                  {r.open > 0 && (
                    <div
                      className={`w-full bg-accent/30 ${r.paid > 0 ? "" : "rounded-t-md"}`}
                      style={{ height: `${(r.open / chart.max) * 100}%` }}
                    />
                  )}
                  {r.paid > 0 && (
                    <div
                      className={`w-full bg-accent ${r.open > 0 ? "" : "rounded-t-md"}`}
                      style={{ height: `${Math.max(2, (r.paid / chart.max) * 100)}%` }}
                    />
                  )}
                  {total === 0 && <div className="h-[2px] w-full bg-border" />}
                </div>
                <div className={`truncate text-[11px] ${selected ? "font-semibold text-foreground" : "text-muted"}`}>
                  {monthLabel(r.month, locale).split(" ")[0].slice(0, 3)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RevenueCard({
  title,
  period,
  periodHint,
  all,
  open,
  refunds,
}: {
  refunds: string | null;
  title: string;
  period: string;
  periodHint: string | null;
  all: string;
  open: string | null;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] text-muted">{t("frForPeriod")}</div>
          <div className="font-display text-[26px] leading-[1.05] tracking-[-0.02em] text-foreground">{period}</div>
          {periodHint && <div className="text-[11px] text-muted">{periodHint}</div>}
        </div>
        <div>
          <div className="text-[11px] text-muted">{t("frAllTime")}</div>
          <div className="font-display text-lg leading-tight text-ink-2">{all}</div>
        </div>
      </div>
      {refunds && <div className="mt-2 text-[11px] text-accent-strong">{t("frRefundsInPeriod", { amount: refunds })}</div>}
      {open && <div className="mt-2 text-[11px] text-warn">{t("frOpenNow", { amount: open })}</div>}
    </div>
  );
}
