"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { franchiseStageLabel } from "@/lib/franchise";
import { projectToPercent, COUNTRY_CENTROIDS } from "@/lib/geo";
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
 * скриншота (карточки-плитки, донат «Структура сети», блок «География» с
 * условной картой и лента «Недавняя активность»), но заново собранный на
 * реальных данных и реальных названиях стадий нашего пайплайна — сам макет
 * использовал чужую терминологию («Переговоры», «Глубинное интервью») и
 * числа, которые не сходились друг с другом («Стран: 39» vs «8 стран»), и
 * Anastasiia явно подтвердила, что нужно только оформление.
 *
 * Скоуп — PARTNER_STAGES (кандидатки, дошедшие до «Собеседование
 * пройдено» и дальше — см. lib/franchise.ts), не весь пайплайн: «Всего
 * заявок» уже есть выше, в обычной франчайзи-аналитике, а этот блок — про
 * тех, кто дошёл дальше самого начала воронки.
 *
 * Карта «Географии» — НЕ настоящие контуры континентов (это было бы либо
 * нарушением авторских прав на конкретный источник карты, либо неоправданно
 * большим объёмом работы ради решётки координат), а условная сетка с
 * точками по примерным центрам стран (lib/geo.ts) — намеренно абстрактная,
 * чтобы не выглядеть точнее, чем есть на самом деле (см. approximateLocation
 * и geographyCaption).
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
        <p className="mt-0.5 text-xs text-muted">{t("captionNetworkSummaryScope")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t("statNetworkTotal")}
          value={summary.total}
          caption={t("statNetworkTotalCaption")}
          borderColor={COLOR_TERMINAL}
        />
        <StatTile
          label={t("statNetworkContractSigned")}
          value={summary.contractPlus}
          caption={t("pctOfNetworkTotal", { percent: summary.total ? Math.round((summary.contractPlus / summary.total) * 100) : 0 })}
          borderColor={COLOR_CONTRACT}
        />
        <StatTile
          label={t("statNetworkActiveClubs")}
          value={summary.activeClubs}
          caption={t("pctOfNetworkTotal", { percent: summary.total ? Math.round((summary.activeClubs / summary.total) * 100) : 0 })}
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
          <GeoMap geography={geography} />
          <p className="mt-2 text-xs text-muted">{t("geographyCaption")}</p>
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

function StatTile({
  label,
  value,
  caption,
  borderColor,
}: {
  label: string;
  value: number;
  caption: string;
  borderColor: string;
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

/** Условная карта: не контуры континентов, а мягкая сетка широт/долгот с
 * точками по примерным центрам стран (lib/geo.ts) — см. файл-докстринг выше
 * для причины. Размер точки ~ число распознанных кандидаток в стране. */
function GeoMap({ geography }: { geography: ApproxGeography }) {
  const { t } = useLocale();
  const maxCount = Math.max(1, ...geography.countries.map((c) => c.count));
  const gridLines = [12.5, 25, 37.5, 50, 62.5, 75, 87.5];
  return (
    <div
      className="relative mt-3 aspect-[2/1] w-full overflow-hidden rounded-lg border border-border-strong"
      style={{ background: "linear-gradient(180deg, #241019 0%, #1a0c12 60%, #150a0f 100%)" }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 50" preserveAspectRatio="none">
        {gridLines.map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={50} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.2} />
        ))}
        {[10, 20, 30, 40].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.2} />
        ))}
        {geography.countries.map((c) => {
          const centroid = COUNTRY_CENTROIDS[c.country];
          if (!centroid) return null;
          const { xPct, yPct } = projectToPercent(centroid[0], centroid[1]);
          const r = 1.4 + (c.count / maxCount) * 2.6;
          return (
            <g key={c.country}>
              <circle cx={xPct} cy={yPct * 0.5} r={r + 1.5} fill="#4ade80" fillOpacity={0.18} />
              <circle cx={xPct} cy={yPct * 0.5} r={r} fill="#4ade80" fillOpacity={0.85} />
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 text-[10px] text-white/80">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
        {t("geographyMapLegend")}
      </div>
    </div>
  );
}
