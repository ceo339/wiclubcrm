"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { franchiseStageLabel, type FranchiseFunnelStage } from "@/lib/franchiseDashboard";
import { interpolateHex } from "@/lib/leads";

/**
 * The funnel-bars markup shared between FranchiseDashboard's own funnels and
 * the "Квалифицированные" tab's funnel (round 44) — same visual language,
 * pulled out so a second funnel doesn't mean a second copy of this JSX.
 */
export default function FranchiseFunnelBars({ funnel }: { funnel: FranchiseFunnelStage[] }) {
  const { locale, t } = useLocale();
  const max = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <div className="flex flex-col gap-2.5">
      {funnel.map((s, i) => {
        const widthPct = Math.max(8, (s.count / max) * 100);
        const stageColor = interpolateHex("#e2515f", "#7a0c1f", funnel.length > 1 ? i / (funnel.length - 1) : 0);
        return (
          <div key={s.id} className="grid grid-cols-[160px_1fr_112px] items-center gap-3 sm:grid-cols-[200px_1fr_120px]">
            <div className="truncate text-sm text-ink-2">{franchiseStageLabel(s.id, locale)}</div>
            <div
              className="flex h-[30px] min-w-[40px] items-center rounded-lg px-2.5 text-[13px] font-bold text-white transition-[width]"
              style={{ width: `${widthPct}%`, background: stageColor, fontVariantNumeric: "tabular-nums" }}
            >
              {s.count}
            </div>
            <div className="text-right text-xs text-muted">
              {i === 0 ? t("funnelStart") : s.pctFromFirst === null ? t("dash") : t("funnelPctOfNew", { percent: s.pctFromFirst })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
