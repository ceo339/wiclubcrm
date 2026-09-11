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
import type { MonthlyCount } from "@/lib/dashboard";
import Money from "@/components/currency/Money";
import { sourceColor, sourceLabel, stageLabel } from "@/lib/leads";
import { useLocale } from "@/components/i18n/LocaleProvider";
import Sparkline from "./Sparkline";

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

/** A tile's delta already carries its own ▲/▼ (see formatPctDelta /
 * formatPointsDelta) — reusing that same arrow to color the text means one
 * real computation drives both the symbol and the color, nothing new to
 * keep in sync. Deltas with no arrow (all-time totals, "not paid yet", …)
 * stay neutral, same as before. */
function deltaColorClass(delta: string): string {
  if (delta.startsWith("▲")) return "text-ink-2";
  if (delta.startsWith("▼")) return "text-accent-strong";
  return "text-muted";
}

function StatTile({
  label,
  value,
  delta,
  spark,
}: {
  label: string;
  value: ReactNode;
  delta: string;
  /** Optional real monthly trend behind this tile — see monthlyRevenue /
   * monthlyMemberTotal / monthlyConversion in lib/dashboard.ts. Omitted on
   * tiles with no natural monthly series (royalty, pending, all-time
   * totals), same as the prototype's own kpi() calls leave some blank. */
  spark?: { values: number[]; color: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className={`mt-1 text-xs ${deltaColorClass(delta)}`}>{delta}</div>
      {spark && <Sparkline values={spark.values} color={spark.color} />}
    </div>
  );
}

/** Builds the "?month=..." / "?year=..." / "?from=...&to=..." query string
 * for the given period, so links to a club's own dashboard keep the
 * currently selected period instead of resetting it. */
function periodQuery(period: Period): string {
  if (period.mode === "month") return `?month=${period.month}`;
  if (period.mode === "year") return `?year=${period.year}`;
  return `?from=${period.from}&to=${period.to}`;
}

function PeriodFilter({
  period,
  monthOptions,
  yearOptions,
  basePath,
}: {
  period: Period;
  monthOptions: string[];
  /** "нужно добавить еще переключение «год» и там все данные за 12 мес"
   * (Anastasiia, 11 сен 2026) — the button list behind the "Год" tab. */
  yearOptions: string[];
  basePath: string;
}) {
  const { locale, t } = useLocale();
  // Which tab is showing is pure local UI state (not part of the URL) — it
  // only decides which button row is visible; clicking an actual month or
  // year button is what navigates and changes real data.
  const [tab, setTab] = useState<"month" | "year">(period.mode === "year" ? "year" : "month");
  const tabOptions = tab === "month" ? monthOptions : yearOptions;
  return (
    <div className="rounded-xl border border-border bg-background shadow-card p-4">
      <div className="mb-2 inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
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
      <div className="flex flex-wrap items-center gap-2">
        {tabOptions.map((key) => {
          const isActive =
            tab === "month" ? period.mode === "month" && period.month === key : period.mode === "year" && period.year === key;
          return (
            <Link
              key={key}
              href={tab === "month" ? `${basePath}?month=${key}` : `${basePath}?year=${key}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-ink-2 hover:bg-surface-2"
              }`}
            >
              {tab === "month" ? monthLabel(key, locale) : key}
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
 * "Требует внимания" — real, honest signals only, never a score: open
 * tasks someone actually typed, leads nobody has touched in a while, and
 * (network view only) clubs whose real revenue slipped vs last month. Each
 * panel is independent — a page passes whichever apply — laid out with
 * auto-fit so 1, 2 or 3 panels all fill the row evenly. An empty list says
 * so honestly rather than disappearing, so a quiet week reads as "all
 * clear", not as missing.
 */
function AttentionGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      {children}
    </div>
  );
}

function StaleLeadsPanel({ staleLeads }: { staleLeads: StaleLead[] }) {
  const { locale, t } = useLocale();
  return (
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
  );
}

function DecliningClubsPanel({ decliningClubs }: { decliningClubs: DecliningClub[] }) {
  const { locale, t } = useLocale();
  return (
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
  );
}

/**
 * "Какой канал приводит участниц" — real leads by source for the period, as
 * a colored horizontal bar per source (same source→color mapping as the
 * Leads page's donut and kanban cards, from lib/leads.sourceColor — one
 * mapping, reused everywhere a source needs a swatch), with the real
 * fraction of each that reached "Оплата". See the doc comment on
 * SourceConversion in lib/dashboard.ts for why "reached Оплата" stands in
 * for "стала участницей".
 */
function SourceConversionTable({ rows }: { rows: SourceConversion[] }) {
  const { locale, t } = useLocale();
  const max = Math.max(1, ...rows.map((r) => r.leadsCount));
  return (
    <div className="rounded-xl border border-border bg-background shadow-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("headingSourceConversion")}</h2>
        {rows.length > 0 && (
          <span className="text-xs text-muted">
            {t("colLeads")} · {t("colSourcePctPaid")}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("emptyNoLeadsPeriod")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.source || "—"} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-sm text-ink-2">
                {r.source ? sourceLabel(r.source, locale) : t("sourceUnknown")}
              </div>
              <div className="h-3 flex-1 rounded-full bg-surface-2">
                <div
                  className="h-3 rounded-full"
                  style={{ width: `${(r.leadsCount / max) * 100}%`, background: sourceColor(r.source) }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm font-medium text-foreground">{r.leadsCount}</div>
              <div className="w-12 shrink-0 text-right text-xs text-muted">
                {r.pctPaid === null ? t("dash") : `${r.pctPaid}%`}
              </div>
            </div>
          ))}
        </div>
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
                  className="w-full max-w-10 rounded-t-md bg-accent transition-opacity hover:opacity-80"
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
  tasksPanel,
  period,
  monthOptions,
  yearOptions,
  basePath,
  revenue,
  revenueTrend,
  memberTrend,
  conversionTrend,
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
  /** The page's own "Мои задачи" / "Задачи по сети" widget, passed in as a
   * finished element rather than raw task data — this component doesn't
   * need to know how a task is fetched or what an OpenTask looks like, only
   * where it sits in the "требует внимания" row. */
  tasksPanel?: ReactNode;
  period: Period;
  monthOptions: string[];
  /** Button list behind the dashboard's "Год" tab — see PeriodFilter. */
  yearOptions: string[];
  /** "/dashboard" for the network view, "/dashboard/<id>" for a club's own. */
  basePath: string;
  revenue: { amount: number; delta: number | null };
  revenueTrend: MonthlyRevenue[];
  /** Real running member-count trend behind the "Участниц" tile's
   * sparkline — see monthlyMemberTotal in lib/dashboard.ts. */
  memberTrend: MonthlyCount[];
  /** Real month-by-month conversion-rate trend behind the "Лид →
   * участница" tile's sparkline — see monthlyConversion in lib/dashboard.ts. */
  conversionTrend: MonthlyCount[];
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
  productsPeriod: ProductCount[];
  productsAllTime: ProductCount[];
}) {
  const { locale, t } = useLocale();
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  // Only a calendar month has a well-defined single "previous period" to
  // compare against — a custom range or a whole year doesn't, same as
  // range mode already handled before "Год" existed.
  const noPrevComparison = period.mode !== "month";
  const qs = periodQuery(period);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PeriodFilter period={period} monthOptions={monthOptions} yearOptions={yearOptions} basePath={basePath} />

      {(tasksPanel || staleLeads || decliningClubs) && (
        <AttentionGrid>
          {tasksPanel}
          {staleLeads && <StaleLeadsPanel staleLeads={staleLeads} />}
          {decliningClubs && <DecliningClubsPanel decliningClubs={decliningClubs} />}
        </AttentionGrid>
      )}

      <p className="text-sm text-muted">
        {t("metricsForPrefix")} <span className="font-medium text-foreground">{periodLabel(period, locale)}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t("statRevenue")}
          value={<Money amountEur={revenue.amount} />}
          delta={noPrevComparison ? t("deltaForPeriod") : formatPctDelta(revenue.delta, locale)}
          spark={{ values: revenueTrend.map((m) => m.amount), color: "var(--accent)" }}
        />
        <StatTile
          label={t("statMembers")}
          value={String(membersAdded)}
          delta={t("deltaForPeriod")}
          spark={{ values: memberTrend.map((m) => m.value), color: "var(--ink-2)" }}
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
            noPrevComparison
              ? conversion.value === null
                ? t("deltaNoLeadsInPeriod")
                : t("deltaNoRangeComparison")
              : formatPointsDelta(conversion.value, conversion.previous, locale)
          }
          spark={{ values: conversionTrend.map((m) => m.value), color: "var(--accent-strong)" }}
        />
      </div>

      {/* "Если на главной я выбрала август, то данные все за этот период"
         (Anastasiia, 11 сен 2026) — these four used to be genuine all-time
         totals, unaffected by the period filter above; that read as "the
         month switcher does nothing" since nothing here ever changed. Now
         period-scoped like everything else on the page (fourthTile stays
         all-time on purpose — a club/course count isn't dated). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("statLeadsTotal")} value={String(totals.leads)} delta={t("deltaForPeriod")} />
        <StatTile
          label={t("statCollectedTotal")}
          value={<Money amountEur={totals.collected} />}
          delta={t("deltaForPeriod")}
        />
        <StatTile
          label={t("statPending")}
          value={<Money amountEur={totals.pending} />}
          delta={t("deltaForPeriod")}
        />
        <StatTile label={t(fourthTile.labelKey)} value={fourthTile.value} delta={t(fourthTile.deltaKey)} />
      </div>

      <RevenueTrendChart months={revenueTrend} />

      <div className="rounded-xl border border-border bg-background shadow-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("headingFunnel")}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {funnel.map((s, i) => {
            const isLast = i === funnel.length - 1;
            const widthPct = Math.max(8, (s.count / maxFunnel) * 100);
            return (
              <div key={s.id} className="grid grid-cols-[140px_1fr_112px] items-center gap-3 sm:grid-cols-[160px_1fr_120px]">
                <div className="truncate text-sm text-ink-2">{t(s.labelKey)}</div>
                <div
                  className={`flex h-[30px] min-w-[40px] items-center rounded-lg px-2.5 text-[13px] font-bold text-white transition-[width] ${
                    isLast ? "bg-accent-strong" : "bg-accent"
                  }`}
                  style={{ width: `${widthPct}%`, fontVariantNumeric: "tabular-nums" }}
                >
                  {s.count}
                </div>
                <div className="text-right text-xs text-muted">
                  {i === 0
                    ? t("funnelStart")
                    : s.pctFromPrevious === null
                      ? t("dash")
                      : t("funnelPctContinue", { percent: s.pctFromPrevious })}
                </div>
              </div>
            );
          })}
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
