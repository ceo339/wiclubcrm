"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { monthLabel } from "@/lib/dashboard";

export type FinTab = "pf" | "journal" | "cash" | "plan";
const TABS: { id: FinTab; key: string }[] = [
  { id: "pf", key: "finTabPf" },
  { id: "journal", key: "finTabJournal" },
  { id: "cash", key: "finTabCash" },
  { id: "plan", key: "finTabPlan" },
];

export default function FinanceNav({
  tab,
  period,
  months,
  years,
  filledMonths,
  hideTabs = false,
}: {
  tab: FinTab;
  period: string;
  months: string[];
  years: string[];
  filledMonths: string[];
  hideTabs?: boolean;
}) {
  const { locale, t } = useLocale();
  const href = (tb: FinTab, p: string) => `/finance?tab=${tb}&month=${p}`;
  const pill = "rounded-lg px-3 py-1.5 text-sm";
  return (
    <div className="mb-4 space-y-3">
      {!hideTabs && <div className="flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={href(x.id, period)}
            className={`${pill} border ${x.id === tab ? "border-foreground bg-foreground text-background" : "border-border bg-background text-ink-2 hover:bg-surface-2"}`}
          >
            {t(x.key)}
          </Link>
        ))}
      </div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {months.map((m) => {
          const [y, mm] = m.split("-");
          const short = monthLabel(m, locale).split(" ")[0].slice(0, 3);
          return (
            <Link
              key={m}
              href={href(tab, m)}
              title={monthLabel(m, locale)}
              className={`${pill} ${m === period ? "bg-accent font-semibold text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
            >
              {short}
              {mm === "01" || m === months[0] ? ` ${y}` : ""}
              {filledMonths.includes(m) ? " ✓" : ""}
            </Link>
          );
        })}
        {years.map((y) => (
          <Link
            key={y}
            href={href(tab === "plan" ? "pf" : tab, y)}
            className={`${pill} ${y === period ? "bg-accent font-semibold text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
          >
            {t("finWholeYear", { y })}
          </Link>
        ))}
      </div>
    </div>
  );
}
