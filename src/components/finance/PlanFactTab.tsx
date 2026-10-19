"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { monthLabel } from "@/lib/dashboard";
import { isZero, scale, sub, type Amt } from "@/lib/finance/amt";
import type { Line, ProfitLoss } from "@/lib/finance/report";
import { setMonthAccepted, setMonthFilled } from "@/app/finance/actions";
import { A, devClass, pctText } from "./A";

function Kpi({ label, value, hint, bad, bar }: { label: string; value: React.ReactNode; hint?: React.ReactNode; bad?: boolean; bar?: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 font-display text-[24px] leading-[1.1] tracking-[-0.02em] ${bad ? "text-accent-strong" : "text-foreground"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      {bar !== null && bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

const ZERO: Amt = { eur: 0, loc: 0, cur: null, ok: true };

function Row({
  name, plan, fact, higherIsBad, kind = "line", chip, hint, href, uk,
}: {
  name: React.ReactNode; plan: Amt; fact: Amt; higherIsBad: boolean;
  kind?: "line" | "group" | "sub" | "sub2" | "total"; chip?: string; hint?: React.ReactNode; href?: string;
  /** план УК по этой строке — только для hq/viewer (undefined = колонки УК не показываем) */
  uk?: Amt;
}) {
  const diff = sub(fact, plan);
  const diffUk = uk ? sub(fact, uk) : null;
  const cls =
    kind === "group" || kind === "total" ? "font-semibold" : "";
  const pad = kind === "sub" ? "pl-7" : kind === "sub2" ? "pl-12" : "";
  const label = href ? <Link href={href} className="underline-offset-2 hover:underline">{name}</Link> : name;
  return (
    <tr className={`border-t border-border ${kind === "total" ? "bg-surface-2" : ""}`}>
      <td className={`px-3 py-2 text-left ${cls} ${pad} ${kind === "sub" || kind === "sub2" ? "text-ink-2" : ""}`}>
        {label}
        {chip && <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">{chip}</span>}
        {hint && <div className="text-[11px] font-normal text-muted">{hint}</div>}
      </td>
      {uk && <td className="px-3 py-2 text-right text-ink-2"><A v={uk} /></td>}
      <td className="px-3 py-2 text-right"><A v={plan} /></td>
      <td className={`px-3 py-2 text-right ${cls}`}><A v={fact} /></td>
      <td className={`px-3 py-2 text-right ${devClass(diff.eur, higherIsBad)}`}>{isZero(diff) ? <span className="text-muted">0</span> : <A v={diff} signed />}</td>
      <td className={`px-3 py-2 text-right ${devClass(diff.eur, higherIsBad)}`}>{pctText(fact.eur, plan.eur)}</td>
      {uk && diffUk && (
        <td className={`px-3 py-2 text-right ${devClass(diffUk.eur, higherIsBad)}`}>
          {isZero(diffUk) ? <span className="text-muted">0</span> : <A v={diffUk} signed />}
          <div className="text-[11px]">{pctText(fact.eur, uk.eur)}</div>
        </td>
      )}
    </tr>
  );
}

function FilledToggle({ month, filled, canManage }: { month: string; filled: boolean; canManage: boolean }) {
  const { t } = useLocale();
  const [pending, start] = useTransition();
  if (!canManage) return filled ? <span className="text-sm text-muted">✓ {t("finMonthFilled")}</span> : null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await setMonthFilled(month, !filled); })}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${filled ? "border-foreground bg-foreground text-background" : "border-border text-ink-2 hover:bg-surface-2"}`}
    >
      {filled ? `✓ ${t("finMonthFilled")}` : t("finMarkMonthFilled")}
    </button>
  );
}

/** «Отчёт принят» — головной офис подтверждает месяц перед передачей финдиректору; остальные видят статус. */
function AcceptToggle({ month, accepted, canAccept }: { month: string; accepted: { at: string | null; by: string | null } | null; canAccept: boolean }) {
  const { locale, t } = useLocale();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const d = accepted?.at ? new Date(accepted.at).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU") : "";
  const label = accepted ? (accepted.by ? t("finReportAcceptedBy", { d, who: accepted.by }) : t("finReportAccepted", { d })) : "";
  if (!canAccept) return accepted ? <span className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background">✓ {label}</span> : null;
  return (
    <span className="inline-flex items-center gap-2">
      {accepted ? (
        <>
          <span className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background">✓ {label}</span>
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setMonthAccepted(month, false); setErr(r.error); })} className="text-xs text-muted underline hover:text-ink-2 disabled:opacity-50">
            {t("finUnaccept")}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (confirm(t("finAcceptConfirm", { m: monthLabel(month, locale) }))) start(async () => { const r = await setMonthAccepted(month, true); setErr(r.error); }); }}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {t("finAcceptReport")}
        </button>
      )}
      {err && <span className="text-xs text-accent-strong">{t(err)}</span>}
    </span>
  );
}

export default function PlanFactTab({
  pl, period, filled, canManage, hasAnyPlan, uk, accepted = null, canAccept = false,
}: {
  pl: ProfitLoss; period: string; filled: boolean; canManage: boolean; hasAnyPlan: boolean;
  accepted?: { at: string | null; by: string | null } | null;
  canAccept?: boolean;
  /** план-факт по плану УК (видят все, включая партнёра) */
  uk?: ProfitLoss;
}) {
  const { locale, t } = useLocale();
  // план УК по строкам (для колонок «План УК» / «Откл. от УК»)
  const ukRev = new Map((uk?.revenue ?? []).map((r) => [r.id, r] as const));
  const ukGroup = new Map((uk?.groups ?? []).map((g) => [g.id, g.plan] as const));
  const ukLeaf = new Map((uk?.groups ?? []).flatMap((g) => g.leaves).map((l) => [l.id, l] as const));
  const u = (v: Amt | undefined) => (uk ? (v ?? ZERO) : undefined);
  // продукт, который есть только в плане УК, тоже показываем строкой
  const revenueRows = [
    ...pl.revenue,
    ...(uk?.revenue ?? []).filter((r) => !pl.revenue.some((x) => x.id === r.id)).map((r) => ({ ...r, plan: ZERO, planQty: 0 })),
  ];
  const colCount = uk ? 7 : 5;
  const isYear = /^\d{4}$/.test(period);
  const revDiff = sub(pl.revenueFact, pl.revenuePlan);
  const revPct = pl.revenuePlan.eur > 0 ? Math.round((pl.revenueFact.eur / pl.revenuePlan.eur) * 100) : null;
  const lagging = pl.cumulative ? sub(pl.cumulative.fact, pl.cumulative.plan) : null;

  // под продуктом: план «N чел. × цена» и сколько записалось/пришло/оплатило
  const revHint = (r: ProfitLoss["revenue"][number]) => {
    const came = r.counts.enrolled > 0 || r.counts.came > 0
      ? t("finCameDetail", { came: r.counts.came, paid: r.counts.paid, free: r.counts.free, enrolled: r.counts.enrolled })
      : "";
    const planPart = r.planQty > 0 ? <>{t("finPlanQty", { n: r.planQty })} × <A v={scale(r.plan, 1 / r.planQty)} /></> : null;
    if (!planPart && !came) return undefined;
    return <>{planPart}{planPart && came ? " · " : ""}{came}</>;
  };
  const catLink = (id: string) => `/finance?tab=journal&month=${period}&cat=${id}`;
  const lineProducts = (ps: Line[], indent: "sub" | "sub2", leafId: string) => {
    const ukPs = ukLeaf.get(leafId)?.products ?? [];
    const all = [...ps, ...ukPs.filter((x) => !ps.some((p) => p.id === x.id)).map((x) => ({ ...x, plan: ZERO }))];
    return all
      .filter((p) => !(isZero(p.plan) && isZero(p.fact) && isZero(ukPs.find((x) => x.id === p.id)?.plan ?? ZERO)))
      .map((p) => <Row key={p.id} kind={indent} name={p.name} plan={p.plan} fact={p.fact} higherIsBad uk={u(ukPs.find((x) => x.id === p.id)?.plan)} />);
  };

  return (
    <div className="space-y-4">
      {!hasAnyPlan && (
        <p className="rounded-xl border border-border bg-background p-4 text-sm text-muted shadow-card">
          {t("finNoPlanYet")}{" "}
          {canManage && <Link className="font-medium text-foreground underline" href={`/finance?tab=plan&month=${isYear ? period + "-01" : period}`}>{t("finGoToPlan")}</Link>}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{t("finDeadlinesHint")}</div>
        {!isYear && (
          <div className="flex flex-wrap items-center gap-2">
            <FilledToggle month={period} filled={filled} canManage={canManage && !accepted} />
            <AcceptToggle month={period} accepted={accepted} canAccept={canAccept} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label={t("finKpiRevenue")}
          value={<A v={pl.revenueFact} />}
          bad={revDiff.eur < -0.005 && pl.revenuePlan.eur > 0}
          bar={revPct}
          hint={<>
            {pl.revenuePlan.eur > 0 ? <><A v={revDiff} signed /> · {t("finOfPlan", { p: revPct ?? 0 })}</> : t("finNoPlan")}
            {uk && <div>{t("finPlanUkWord")} <A v={uk.revenuePlan} />{uk.revenuePlan.eur > 0 ? ` · ${Math.round((pl.revenueFact.eur / uk.revenuePlan.eur) * 100)}%` : ""}</div>}
          </>}
        />
        <Kpi label={t("finKpiExpenses")} value={<A v={pl.expensesFact} />} hint={<>{t("finPlanWord")} <A v={pl.expensesPlan} />{uk && <div>{t("finPlanUkWord")} <A v={uk.expensesPlan} /></div>}</>} />
        <Kpi
          label={t("finKpiProfit")}
          value={<A v={pl.profitFact} />}
          bad={pl.profitFact.eur < 0}
          hint={<>{t("finPlanWord")} <A v={pl.profitPlan} />{uk && <div>{t("finPlanUkWord")} <A v={uk.profitPlan} /></div>}</>}
        />
        <Kpi
          label={pl.cumulative ? t("finKpiLag", { m: monthLabel(pl.cumulative.fromMonth, locale).split(" ")[0] }) : t("finKpiLagNoPlan")}
          value={lagging ? <A v={lagging} /> : "—"}
          bad={!!lagging && lagging.eur < -0.005}
          hint={pl.cumulative ? <>{t("finFactWord")} <A v={pl.cumulative.fact} /> {t("finOfWord")} <A v={pl.cumulative.plan} /></> : undefined}
        />
      </div>
      {pl.pace && (
        <p className="text-sm text-ink-2">
          {t("finPace", { d: pl.pace.elapsed, n: pl.pace.days })} <A v={pl.pace.plannedToDate} />
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className={`w-full ${uk ? "min-w-[860px]" : "min-w-[640px]"} text-sm`}>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finColItem")}</th>
              {uk && <th className="px-3 py-2 text-right font-medium">{t("finColPlanUk")}</th>}
              <th className="px-3 py-2 text-right font-medium">{uk ? t("finColPlanPartner") : t("finColPlan")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColFact")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColDev")}</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              {uk && <th className="px-3 py-2 text-right font-medium">{t("finColDevUk")}</th>}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={colCount} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{t("finSecRevenue")}</td></tr>
            {revenueRows.map((r) => (
              <Row key={r.id} name={r.name} plan={r.plan} fact={r.fact} higherIsBad={false} chip={t("finFromCrm")} hint={revHint(r)} uk={u(ukRev.get(r.id)?.plan)} />
            ))}
            {!isZero(pl.otherIncome) && (
              <Row name={t("finOtherIncome")} plan={ZERO} fact={pl.otherIncome} higherIsBad={false} uk={u(ZERO)} />
            )}
            {pl.idleProducts.length > 0 && (
              <tr className="border-t border-border"><td colSpan={colCount} className="px-3 py-2 text-xs text-muted">{pl.idleProducts.join(" · ")} — {t("finIdleProducts")}</td></tr>
            )}
            <Row kind="total" name={t("finTotalRevenue")} plan={pl.revenuePlan} fact={pl.revenueFact} higherIsBad={false} uk={u(uk?.revenuePlan)} />

            <tr><td colSpan={colCount} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{t("finSecExpenses")}</td></tr>
            {pl.groups.filter((g) => g.inPl && !g.isTax).map((g) => {
              const single = g.leaves.length === 1 && g.leaves[0].perProduct && g.leaves[0].name.startsWith(g.name.slice(0, 5));
              return [
                <Row key={g.id} kind="group" name={g.name} plan={g.plan} fact={g.fact} higherIsBad uk={u(ukGroup.get(g.id))} />,
                ...(single
                  ? lineProducts(g.leaves[0].products, "sub", g.leaves[0].id)
                  : g.leaves.flatMap((l) => [
                      <Row
                        key={l.id}
                        kind="sub"
                        name={l.name}
                        plan={l.plan}
                        fact={l.fact}
                        higherIsBad
                        chip={l.autoPercent !== null ? t("finAuto") : undefined}
                        hint={l.autoPercent !== null ? t("finAutoHint", { p: l.autoPercent }) : undefined}
                        href={l.autoPercent === null ? catLink(l.id) : undefined}
                        uk={u(ukLeaf.get(l.id)?.plan)}
                      />,
                      ...lineProducts(l.products, "sub2", l.id),
                    ])),
              ];
            })}
            <Row kind="total" name={t("finTotalExpenses")} plan={pl.expensesPlan} fact={pl.expensesFact} higherIsBad uk={u(uk?.expensesPlan)} />
            <Row kind="total" name={t("finProfitBeforeTax")} plan={pl.profitPlan} fact={pl.profitFact} higherIsBad={false} uk={u(uk?.profitPlan)} />
            {pl.groups.filter((g) => g.isTax).map((g) => (
              <Row key={g.id} kind="group" name={g.name} plan={g.plan} fact={g.fact} higherIsBad uk={u(ukGroup.get(g.id))} />
            ))}
            {pl.groups.some((g) => g.isTax) && (
              <Row kind="total" name={t("finProfitAfterTax")} plan={pl.netProfitPlan} fact={pl.netProfitFact} higherIsBad={false} uk={u(uk?.netProfitPlan)} />
            )}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
        <li>{t("finLegendColors")}</li>
        {!filled && !isYear && <li>{t("finLegendNotFilled")}</li>}
        <li>{t("finLegendInvest")}</li>
      </ul>
    </div>
  );
}
