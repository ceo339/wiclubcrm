"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  DecliningClub,
  FunnelStage,
  MonthlyRevenue,
  Period,
  ProductCount,
  SourceConversion,
  StaleLead,
} from "@/lib/dashboard";
import { formatPctDelta, formatPointsDelta, monthLabel, periodLabel } from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import { sourceLabel, stageLabel } from "@/lib/leads";
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
    <div className="rounded-xl border border-border bg-background p-4 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
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
    <div className="rounded-xl border border-border bg-background shadow-card p-4">
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
    <div className="flex-1 rounded-xl border border-border bg-background shadow-card">
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

/**
 * "Требует внимания" — two honest signals, not a score: leads nobody has
 * touched in a while, and clubs whose real revenue slipped vs last month.
 * Both lists come straight from lib/dashboard's plain filters over the same
 * rows already on this page — nothing predicted, nothing hidden behind a
 * single number. Shown only on the network view (HQ is the audience for
 * "which of my clubs needs a call"); an empty list says so honestly rather
 * than disappearing, so a quiet week reads as "all clear", not as missing.
 */
function AttentionSection({
  staleLeads,
  decliningClubs,
}: {
  staleLeads: StaleLead[];
  decliningClubs: DecliningClub[];
}) {
  const { locale, t } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-background shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t("headingStaleLeads")}</h2>
        </div>
        {staleLeads.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("emptyNoStaleLeads")}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("colLead")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("colClub")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("colStage")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("colDaysStuck")}</th>
                </tr>
              </thead>
              <tbody>
                {staleLeads.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{l.name}</td>
                    <td className="px-5 py-2.5 text-muted">{l.partnerName}</td>
                    <td className="px-5 py-2.5 text-muted">{stageLabel(l.stage, locale)}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-accent-strong">
                      {t("daysCount", { n: l.daysSinceUpdate })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-border px-5 py-3">
          <Link href="/leads" className="text-sm text-muted hover:text-ink-2 hover:underline">
            {t("linkViewAllLeads")} →
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t("headingDecliningClubs")}</h2>
        </div>
        {decliningClubs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("emptyNoDecliningClubs")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {decliningClubs.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 font-medium text-foreground">
                    <Link href={`/dashboard/${c.id}`} className="hover:text-accent hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-right text-accent-strong">
                    {formatPctDelta(c.delta, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * "Какой канал приводит участниц" — real leads by source for the period,
 * with the real fraction of each that reached "Оплата". See the doc
 * comment on SourceConversion in lib/dashboard.ts for why "reached Оплата"
 * stands in for "стала участницей".
 */
function SourceConversionTable({ rows }: { rows: SourceConversion[] }) {
  const { locale, t } = useLocale();
  return (
    <div className="rounded-xl border border-border bg-background shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{t("headingSourceConversion")}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t("emptyNoLeadsPeriod")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">{t("colSource")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("colLeads")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("colSourcePctPaid")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source || "—"} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-medium text-foreground">
                  {r.source ? sourceLabel(r.source, locale) : t("sourceUnknown")}
                </td>
                <td className="px-5 py-2.5 text-right text-muted">{r.leadsCount}</td>
                <td className="px-5 py-2.5 text-right text-muted">
                  {r.pctPaid === null ? t("dash") : `${r.pctPaid}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * "Что заработал клуб" — real collected revenue per month, last 6 months,
 * always ending on the current (in-progress) month. Deliberately no
 * forecast bars past "today": see the doc comment on monthlyRevenue in
 * lib/dashboard.ts for why that was left out rather than approximated.
 */
function RevenueTrendChart({ months }: { months: MonthlyRevenue[] }) {
  const { locale, t } = useLocale();
  const max = Math.max(1, ...months.map((m) => m.amount));
  const hasAnyRevenue = months.some((m) => m.amount > 0);

  return (
    <div className="rounded-xl border border-border bg-background shadow-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("headingRevenueTrend")}</h2>
      {!hasAnyRevenue ? (
        <p className="mt-3 text-sm text-muted">{t("emptyNoRevenueHistory")}</p>
      ) : (
        <div className="mt-5 flex items-end gap-3">
          {months.map((m) => (
            <div key={m.monthKey} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-xs font-medium text-foreground">
                <Money amountEur={m.amount} />
              </div>
              <div className="flex h-32 w-full items-end justify-center">
                <div
                  className="w-full max-w-10 rounded-t-md bg-foreground transition-opacity hover:opacity-70"
                  style={{ height: `${Math.max(2, (m.amount / max) * 100)}%` }}
                  title={`${monthLabel(m.monthKey, locale)}: ${m.amount.toLocaleString(locale === "ru" ? "ru-RU" : "bg-BG")} €`}
                />
              </div>
              <div className="text-[11px] text-muted">{monthLabel(m.monthKey, locale).split(" ")[0]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ClubSortKey = "name" | "leads" | "members" | "collected" | "pending";

function ClubSortHeader({
  label,
  sortKeyName,
  activeSortKey,
  sortDir,
  align,
  onSort,
}: {
  label: string;
  sortKeyName: ClubSortKey;
  activeSortKey: ClubSortKey;
  sortDir: "asc" | "desc";
  align?: "right";
  onSort: (key: ClubSortKey) => void;
}) {
  const active = activeSortKey === sortKeyName;
  return (
    <th
      className={`px-5 py-3 font-medium ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKeyName)}
        className={`inline-flex items-center gap-1 hover:text-ink-2 ${active ? "text-ink-2" : ""}`}
      >
        {label}
        <span className="w-2.5 text-[10px] leading-none text-muted">
          {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

/**
 * Sortable "по клубам" table — click any column to rank clubs by that real
 * metric (highest first by default, click again to flip). This replaces
 * the prototype's bubble map with club "health" statuses (Стабильно / Под
 * наблюдением / Нужна помощь) — that was an opaque score with no visible
 * formula behind it, same objection as the AI lead score and churn-risk
 * tag that were already left out elsewhere. Ranking the same numbers the
 * table already shows is the honest version: nothing is computed that
 * isn't also right there in the row.
 */
function ClubsTable({ clubs, qs }: { clubs: ClubRow[]; qs: string }) {
  const { t } = useLocale();
  const [sortKey, setSortKey] = useState<ClubSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: ClubSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sortedClubs = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const valueFor = (c: ClubRow) =>
      sortKey === "leads"
        ? c.leadsCount
        : sortKey === "members"
          ? c.membersCount
          : sortKey === "collected"
            ? c.collected
            : c.pending;
    return [...clubs].sort((a, b) =>
      sortKey === "name" ? a.name.localeCompare(b.name) * dir : (valueFor(a) - valueFor(b)) * dir
    );
  }, [clubs, sortKey, sortDir]);

  return (
    <div className="rounded-xl border border-border bg-background shadow-card">
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
                <ClubSortHeader label={t("colClub")} sortKeyName="name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ClubSortHeader label={t("colLeads")} sortKeyName="leads" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ClubSortHeader label={t("statMembers")} sortKeyName="members" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ClubSortHeader label={t("colCollected")} sortKeyName="collected" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <ClubSortHeader label={t("statPending")} sortKeyName="pending" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedClubs.map((c) => (
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
  );
}

export default function DashboardBoard({
  totals,
  fourthTile,
  funnel,
  declinedCount,
  sourceConversion,
  clubs,
  staleLeads,
  decliningClubs,
  period,
  monthOptions,
  basePath,
  revenue,
  revenueTrend,
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
  funnel: FunnelStage[];
  declinedCount: number;
  sourceConversion: SourceConversion[];
  /** Omit on a club's own dashboard — there's nothing to break down by club. */
  clubs?: ClubRow[];
  /** Omit on a club's own dashboard, same as `clubs` — "требует внимания" is
   * an HQ, network-wide view. */
  staleLeads?: StaleLead[];
  decliningClubs?: DecliningClub[];
  period: Period;
  monthOptions: string[];
  /** "/dashboard" for the network view, "/dashboard/<id>" for a club's own. */
  basePath: string;
  revenue: { amount: number; delta: number | null };
  revenueTrend: MonthlyRevenue[];
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
  productsPeriod: ProductCount[];
  productsAllTime: ProductCount[];
}) {
  const { locale, t } = useLocale();
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const isRange = period.mode === "range";
  const qs = periodQuery(period);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PeriodFilter period={period} monthOptions={monthOptions} basePath={basePath} />

      {staleLeads && decliningClubs && (
        <AttentionSection staleLeads={staleLeads} decliningClubs={decliningClubs} />
      )}

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

      <RevenueTrendChart months={revenueTrend} />

      <div className="rounded-xl border border-border bg-background shadow-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("headingFunnel")}</h2>
        <div className="mt-4 flex flex-col gap-3">
          {funnel.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-sm text-ink-2">{t(s.labelKey)}</div>
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-foreground"
                  style={{ width: `${(s.count / maxFunnel) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm font-medium text-foreground">
                {s.count}
              </div>
              <div className="w-28 shrink-0 text-right text-xs text-muted">
                {i === 0
                  ? t("funnelStart")
                  : s.pctFromPrevious === null
                    ? t("dash")
                    : t("funnelPctContinue", { percent: s.pctFromPrevious })}
              </div>
            </div>
          ))}
        </div>
        {declinedCount > 0 && (
          <p className="mt-3 text-xs text-muted">{t("funnelDeclinedNote", { n: declinedCount })}</p>
        )}
      </div>

      <SourceConversionTable rows={sourceConversion} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <ProductsTable titleKey="headingProductsPeriod" rows={productsPeriod} />
        <ProductsTable titleKey="headingProductsAllTime" rows={productsAllTime} />
      </div>

      {clubs && <ClubsTable clubs={clubs} qs={qs} />}
    </div>
  );
}
