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
  extraQuery = "",
}: {
  tab: FinTab;
  period: string;
  months: string[];
  years: string[];
  filledMonths: string[];
  hideTabs?: boolean;
  /** доп. параметры ссылок месяцев/годов, например «&plan=uk» на вкладке «План» */
  extraQuery?: string;
}) {
  const { locale, t } = useLocale();
  const href = (tb: FinTab, p: string) => `/finance?tab=${tb}&month=${p}${tb === tab ? extraQuery : ""}`;
  const pill = "rounded-lg px-3 py-1.5 text-sm";
  // месяцы показываем только выбранного года: фильтр «год → месяц»
  const yr = period.slice(0, 4);
  const monthsOfYear = months.filter((m) => m.startsWith(yr));
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
        {years.map((y) => {
          const isSel = y === period;
          const inYear = !isSel && period.startsWith(y);
          // на вкладке «План» месяц правится по одному, поэтому год ведёт на первый месяц этого года
          const target = tab === "plan" ? (months.find((m) => m.startsWith(y)) ?? `${y}-01`) : y;
          return (
            <Link
              key={y}
              href={href(tab, target)}
              title={t("finWholeYear", { y })}
              className={`${pill} font-semibold ${isSel ? "bg-accent text-white" : inYear ? "bg-surface-3 text-foreground ring-1 ring-accent" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
            >
              {y}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {monthsOfYear.map((m) => {
          const short = monthLabel(m, locale).split(" ")[0].slice(0, 3);
          return (
            <Link
              key={m}
              href={href(tab, m)}
              title={monthLabel(m, locale)}
              className={`${pill} ${m === period ? "bg-accent font-semibold text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
            >
              {short} {m.slice(2, 4)}
              {filledMonths.includes(m) ? " ✓" : ""}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
