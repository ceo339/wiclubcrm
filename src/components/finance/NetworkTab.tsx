"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { monthLabel } from "@/lib/dashboard";
import type { NetworkRow } from "@/lib/finance/report";
import { A, devClass, pctText } from "./A";
import { VIEW_SCOPE_COOKIE } from "@/lib/role";

export type NetworkClub = { id: string; name: string; row: NetworkRow; status: "empty" | "filled" | "accepted" | null };

function dueDate(period: string): string {
  if (/^\d{4}$/.test(period)) return "";
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 15));
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Клик по клубу открывает его финансы (тот же cookie, что и у выбора города в шапке). */
function openClub(id: string) {
  document.cookie = `${VIEW_SCOPE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

export default function NetworkTab({ clubs, period }: { clubs: NetworkClub[]; period: string }) {
  const { locale, t } = useLocale();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("finNetworkHint", { p: /^\d{4}$/.test(period) ? period : monthLabel(period, locale) })}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finColClub")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColPlanUk")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColPlanPartner")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColFact")}</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColUk")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColMonthStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map(({ id, name, row, status }) => {
              const diff = row.factRevenue.eur - row.planRevenue.eur;
              return (
                <tr key={id} className="border-t border-border">
                  <td className="px-3 py-2 text-left font-medium">
                    <button type="button" onClick={() => openClub(id)} className="text-left hover:text-accent-strong hover:underline">
                      {name} <span aria-hidden className="text-muted">›</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2">
                    {row.hasPlanUk ? (
                      <>
                        <A v={row.planRevenueUk} />
                        {row.planRevenueUk.eur > 0 && <div className="text-[11px] text-muted">{Math.round((row.factRevenue.eur / row.planRevenueUk.eur) * 100)}%</div>}
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  {row.hasPlan ? (
                    <>
                      <td className="px-3 py-2 text-right"><A v={row.planRevenue} /></td>
                      <td className="px-3 py-2 text-right"><A v={row.factRevenue} /></td>
                      <td className={`px-3 py-2 text-right ${devClass(diff, false)}`}>
                        {row.planRevenue.eur > 0 ? `${Math.round((row.factRevenue.eur / row.planRevenue.eur) * 100)}%` : "—"}
                        <span className="sr-only"> {pctText(row.factRevenue.eur, row.planRevenue.eur)}</span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-muted">{t("finPlanNotEntered")}</td>
                      <td className="px-3 py-2 text-right"><A v={row.factRevenue} /></td>
                      <td className="px-3 py-2 text-right text-muted">—</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    <A v={row.ukDue} />
                    {dueDate(period) && <span className="ml-1 text-xs text-muted">{t("finUkDue", { d: dueDate(period) })}</span>}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs ${status === "accepted" ? "font-semibold text-foreground" : status === "filled" ? "text-accent-strong" : "text-muted"}`}>
                    {status === "accepted" ? `✓✓ ${t("finStatusAccepted")}` : status === "filled" ? `✓ ${t("finStatusFilled")}` : status === "empty" ? t("finStatusEmpty") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
