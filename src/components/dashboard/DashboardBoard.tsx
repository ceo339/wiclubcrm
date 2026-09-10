"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Period, ProductCount, StageCount } from "@/lib/dashboard";
import { formatPctDelta, formatPointsDelta, monthLabel, periodLabel } from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";

export type ClubRow = {
  id: string;
  name: string;
  leadsCount: number;
  membersCount: number;
  collected: number;
  pending: number;
};

type Totals = {
  leads: number;
  members: number;
  collected: number;
  pending: number;
};

function StatTile({ label, value, delta }: { label: string; value: ReactNode; delta: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted">{delta}</div>
    </div>
  );
}

/** Builds the "?month=..." / "?from=...&to=..." query string for the given
 * period, so links to a club's own dashboard keep the currently selected
 * period instead of resetting it. */
function periodQuery(period: Period): string {
  return period.mode === "month" ? `?month=${period.month}` : `?from=${period.from}&to=${period.to}`;
}

function PeriodFilter({
  period,
  monthOptions,
  basePath,
}: {
  period: Period;
  monthOptions: string[];
  basePath: string;
}) {
  const { locale, t } = useLocale();
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        {monthOptions.map((m) => {
          const isActive = period.mode === "month" && period.month === m;
          return (
            <Link
              key={m}
              href={`${basePath}?month=${m}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-ink-2 hover:bg-surface-2"
              }`}
            >
              {monthLabel(m, locale)}
            </Link>
          );
        })}
      </div>
      <form action={basePath} method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted">
          {t("fieldFrom")}
          <input
            type="date"
            name="from"
            defaultValue={period.mode === "range" ? period.from : ""}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          {t("fieldTo")}
          <input
            type="date"
            name="to"
            defaultValue={period.mode === "range" ? period.to : ""}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("btnShowPeriod")}
        </button>
        {period.mode === "range" && (
          <Link href={basePath} className="px-1 py-1.5 text-sm text-muted hover:text-ink-2">
            {t("linkResetToMonths")}
          </Link>
        )}
      </form>
    </div>
  );
}

function productCountLabel(p: ProductCount, t: (key: string) => string): string {
  return p.kind === "product" ? p.name : t(p.kind === "deleted" ? "productDeleted" : "productUnassigned");
}

function ProductsTable({ titleKey, rows }: { titleKey: string; rows: ProductCount[] }) {
  const { t } = useLocale();
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="flex-1 rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{t(titleKey)}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t("emptyNoMembersPeriod")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 text-foreground">{productCountLabel(r, t)}</td>
                <td className="px-5 py-2.5 text-right font-medium text-foreground">{r.count}</td>
              </tr>
            ))}
            <tr>
              <td className="px-5 py-2.5 font-medium text-ink-2">{t("total")}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-foreground">{total}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function DashboardBoard({
  totals,
  fourthTile,
  stageCounts,
  clubs,
  period,
  monthOptions,
  basePath,
  revenue,
  membersAdded,
  conversion,
  royalty,
  productsPeriod,
  productsAllTime,
}: {
  totals: Totals;
  /** The 4th all-time tile — "Клубов в сети" on the network view, "Курсов"
   * (products) on a club's own view. Kept as an explicit prop rather than
   * inferred from `clubs` so each page states plainly what it means. Keys
   * into the dictionary rather than literal text since this component
   * decides the display language, not the (server) page that builds it. */
  fourthTile: { labelKey: string; value: string; deltaKey: string };
  stageCounts: StageCount[];
  /** Omit on a club's own dashboard — there's nothing to break down by club. */
  clubs?: ClubRow[];
  period: Period;
  monthOptions: string[];
  /** "/dashboard" for the network view, "/dashboard/<id>" for a club's own. */
  basePath: string;
  revenue: { amount: number; delta: number | null };
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
  productsPeriod: ProductCount[];
  productsAllTime: ProductCount[];
}) {
  const { locale, t } = useLocale();
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));
  const isRange = period.mode === "range";
  const qs = periodQuery(period);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PeriodFilter period={period} monthOptions={monthOptions} basePath={basePath} />

      <p className="text-sm text-muted">
        {t("metricsForPrefix")} <span className="font-medium text-foreground">{periodLabel(period, locale)}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t("statRevenue")}
          value={<Money amountEur={revenue.amount} />}
          delta={isRange ? t("deltaForPeriod") : formatPctDelta(revenue.delta, locale)}
        />
        <StatTile
          label={t("statMembers")}
          value={String(totals.members)}
          delta={
            membersAdded > 0
              ? t("deltaMembersAdded", { n: membersAdded })
              : t("deltaMembersNone")
          }
        />
        <StatTile
          label={t("statRoyaltyDue")}
          value={<Money amountEur={royalty.amount} />}
          delta={t("deltaRoyaltyPercent", { percent: royalty.percent })}
        />
        <StatTile
          label={t("statConversion")}
          value={conversion.value === null ? "—" : `${conversion.value}%`}
          delta={
            isRange
              ? conversion.value === null
                ? t("deltaNoLeadsInPeriod")
                : t("deltaNoRangeComparison")
              : formatPointsDelta(conversion.value, conversion.previous, locale)
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("statLeadsTotal")} value={String(totals.leads)} delta={t("deltaAllTime")} />
        <StatTile
          label={t("statCollectedTotal")}
          value={<Money amountEur={totals.collected} />}
          delta={t("deltaAllTime")}
        />
        <StatTile
          label={t("statPending")}
          value={<Money amountEur={totals.pending} />}
          delta={t("deltaNotPaidYet")}
        />
        <StatTile label={t(fourthTile.labelKey)} value={fourthTile.value} delta={t(fourthTile.deltaKey)} />
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("headingFunnel")}</h2>
        <div className="mt-4 flex flex-col gap-3">
          {stageCounts.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-sm text-ink-2">{t(s.labelKey)}</div>
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-foreground"
                  style={{ width: `${(s.count / maxStage) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm font-medium text-foreground">
                {s.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ProductsTable titleKey="headingProductsPeriod" rows={productsPeriod} />
        <ProductsTable titleKey="headingProductsAllTime" rows={productsAllTime} />
      </div>

      {clubs && (
        <div className="rounded-xl border border-border bg-background">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">{t("headingClubsPeriod")}</h2>
          </div>
          {clubs.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t("emptyNoClubs")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">{t("colClub")}</th>
                    <th className="px-5 py-3 font-medium">{t("colLeads")}</th>
                    <th className="px-5 py-3 font-medium">{t("statMembers")}</th>
                    <th className="px-5 py-3 font-medium">{t("colCollected")}</th>
                    <th className="px-5 py-3 font-medium">{t("statPending")}</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-medium text-foreground">
                        <Link href={`/dashboard/${c.id}${qs}`} className="hover:text-accent hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">{c.leadsCount}</td>
                      <td className="px-5 py-3 text-muted">{c.membersCount}</td>
                      <td className="px-5 py-3 text-muted">
                        <Money amountEur={c.collected} />
                      </td>
                      <td className="px-5 py-3 text-muted">
                        <Money amountEur={c.pending} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
