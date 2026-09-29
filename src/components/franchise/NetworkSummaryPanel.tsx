"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { franchiseStageLabel } from "@/lib/franchise";
import {
  relativeTimeParts,
  type NetworkSummary,
  type NetworkStructure,
  type ApproxGeography,
  type RecentActivityItem,
} from "@/lib/franchiseDashboard";

// Три категориальных цвета доната ниже прогнаны через
// dataviz-skill'ный scripts/validate_palette.js (light mode) — все
// проверки (band/chroma/CVD/contrast) прошли. --accent-strong переиспользован
// как есть (это уже брендовый «негативный» цвет во всём приложении — см.
// globals.css), два остальных подобраны под него.
const COLOR_BEFORE = "#2F6FB5";
const COLOR_CONTRACT = "#2E8B57";
const COLOR_TERMINAL = "#9e0c24";

/**
 * «Дашборд партнёров» (Anastasiia, round 46) — визуальный референс со
 * скриншота (карточки-плитки, донат «Структура сети», блок «География» и
 * лента «Недавняя активность»), но заново собранный на реальных данных и
 * реальных названиях стадий нашего пайплайна.
 *
 * Скоуп — ВСЕ кандидатки, все стадии (Anastasiia явно уточнила это в
 * фидбеке: «всего заявок на всех стадиях», «структура сети — учитывая все
 * стадии»; более узкий скоуп по PARTNER_STAGES, который был здесь раньше,
 * убран этим же раундом).
 *
 * «География» изначально была условной картой с точками — Anastasiia
 * написала, что карта нечитаема, и попросила либо починить, либо убрать;
 * заменено на обычный список стран-баров (тот же паттерн, что и
 * «Откуда приходят кандидатки» в франчайзи-аналитике ниже) — гарантированно
 * читаемо при любом количестве стран.
 */
export default function NetworkSummaryPanel({
  summary,
  structure,
  geography,
  recentActivity,
}: {
  summary: NetworkSummary;
  structure: NetworkStructure;
  geography: ApproxGeography;
  recentActivity: RecentActivityItem[];
}) {
  const { locale, t } = useLocale();
  const structureTotal = structure.beforeContract + structure.contractPlus + structure.terminal;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl text-foreground">
          {t("headingPartnersDashboard").replace(t("headingPartnersDashboardEm"), "")}
          <em className="italic">{t("headingPartnersDashboardEm")}</em>
        </h2>
        <p className="mt-1 text-sm text-muted">{t("subheadingNetworkSummary")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t("statNetworkTotalApplications")}
          value={summary.totalAll}
          caption={t("statNetworkTotalCaptionWeekly", { n: summary.weeklyAll })}
          borderColor={COLOR_TERMINAL}
        />
        <StatTile
          label={t("statNetworkActiveClubs")}
          value={summary.activeClubs}
          caption={t("pctOfNetworkTotal", {
            percent: summary.totalAll ? Math.round((summary.activeClubs / summary.totalAll) * 100) : 0,
          })}
          borderColor={COLOR_CONTRACT}
        />
        <StatTile
          label={t("statNetworkCountries")}
          value={geography.countries.length}
          caption={t("statNetworkCountriesCaption")}
          borderColor="var(--border-strong)"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-xl border border-border bg-background shadow-card p-5">
          <h3 className="text-sm font-semibold text-foreground">{t("headingNetworkStructure")}</h3>
          <p className="text-xs text-muted">{t("subheadingNetworkStructure")}</p>
          <div className="mt-4 flex items-center justify-center">
            <NetworkDonut structure={structure} total={structureTotal} />
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <LegendRow color={COLOR_BEFORE} label={t("structureBeforeContract")} value={structure.beforeContract} />
            <LegendRow color={COLOR_CONTRACT} label={t("structureContractPlus")} value={structure.contractPlus} />
            <LegendRow color={COLOR_TERMINAL} label={t("structureTerminal")} value={structure.terminal} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background shadow-card p-5">
          <h3 className="text-sm font-semibold text-foreground">{t("headingGeography")}</h3>
          <p className="text-xs text-muted">
            {t("geographySummary", { cities: geography.citiesRecognized, countries: geography.countries.length })}
          </p>
          <GeoBarList geography={geography} />
          <p className="mt-3 text-xs text-muted">{t("geographyCaption")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">{t("headingRecentActivity")}</h3>
          <p className="text-xs text-muted">{t("subheadingRecentActivity")}</p>
        </div>
        {recentActivity.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("emptyNoRecentActivity")}</p>
        ) : (
          <div className="divide-y divide-border">
            {recentActivity.map((item) => {
              const rt = relativeTimeParts(item.lastActivityAt);
              const isTerminal = item.stage === "declined" || item.stage === "paused";
              return (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">
                    {initials(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{item.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isTerminal
                            ? "bg-accent-soft text-accent-strong"
                            : item.stage === "active"
                              ? "text-white"
                              : "bg-surface-2 text-ink-2"
                        }`}
                        style={item.stage === "active" ? { background: COLOR_CONTRACT } : undefined}
                      >
                        {franchiseStageLabel(item.stage, locale)}
                      </span>
                      {item.city && <span className="text-xs text-muted">· {item.city}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted">{t(rt.key, rt.n !== undefined ? { n: rt.n } : undefined)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

/** Shared stat-tile look — exported so the franchise funnel tiles below
 * (FranchiseDashboard.tsx) can use the exact same visual treatment
 * (Anastasiia, round 46: "сделай нижние виджеты визуально как верхние"). */
export function StatTile({
  label,
  value,
  caption,
  borderColor,
  children,
}: {
  label: string;
  value: number | string;
  caption: string;
  borderColor: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-background p-4 shadow-card"
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{caption}</div>
      {children}
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-ink-2">{label}</span>
      <span className="font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/** Простой SVG-донат из трёх сегментов через stroke-dasharray — без внешних
 * chart-библиотек, тот же подход, что уже используется в остальных местах
 * приложения (funnel-бары через interpolateHex и т.п.). */
function NetworkDonut({ structure, total }: { structure: NetworkStructure; total: number }) {
  const { t } = useLocale();
  const R = 60;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  const safeTotal = Math.max(1, total);
  const segments = [
    { value: structure.beforeContract, color: COLOR_BEFORE },
    { value: structure.contractPlus, color: COLOR_CONTRACT },
    { value: structure.terminal, color: COLOR_TERMINAL },
  ];
  let offset = 0;
  return (
    <div className="relative">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <g transform="translate(80,80) rotate(-90)">
          {segments.map((s, i) => {
            const frac = s.value / safeTotal;
            const dash = frac * C;
            const circle = (
              <circle
                key={i}
                r={R}
                cx={0}
                cy={0}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(0, dash - 2)} ${C - dash + 2}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-2xl text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
          {total}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted">{t("networkStructureTotalLabel")}</div>
      </div>
    </div>
  );
}

/** Список стран горизонтальными барами — тот же визуальный паттерн, что и
 * «Откуда приходят кандидатки» ниже на этой же странице (FranchiseDashboard,
 * headingFranchiseSourceBreakdown). Заменил собой условную карту с точками
 * (Anastasiia, round 46: «не читабельно... не видна карта»,
 * «или убери или сделай читабельной») — список читается при любом числе
 * стран, в отличие от скопления точек на маленькой карте. */
function GeoBarList({ geography }: { geography: ApproxGeography }) {
  const { t } = useLocale();
  const top = geography.countries.slice(0, 8);
  const max = Math.max(1, ...top.map((c) => c.count));
  if (top.length === 0) {
    return <p className="mt-3 text-sm text-muted">{t("dash")}</p>;
  }
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {top.map((c) => (
        <div key={c.country} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-sm text-ink-2">{c.country}</div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (c.count / max) * 100)}%`, background: COLOR_CONTRACT }}
            />
          </div>
          <div className="w-8 shrink-0 text-right text-sm font-medium text-ink-2">{c.count}</div>
        </div>
      ))}
      {geography.unmatchedCount > 0 && (
        <div className="mt-1 flex items-center gap-3 border-t border-border pt-2 text-xs text-muted">
          <div className="w-28 shrink-0 truncate">{t("geoUnmatchedLabel")}</div>
          <div className="flex-1" />
          <div className="w-8 shrink-0 text-right">{geography.unmatchedCount}</div>
        </div>
      )}
    </div>
  );
}
