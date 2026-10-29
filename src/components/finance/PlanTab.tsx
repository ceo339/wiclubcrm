"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useCurrency } from "@/components/currency/CurrencyProvider";
import { BASE_CURRENCY, convertFromEur, convertToEur, currencySymbol, roundMoney } from "@/lib/currency";
import { monthLabel } from "@/lib/dashboard";
import Link from "next/link";
import type { Cat, PlanRow, PlanType, Prod } from "@/lib/finance/report";
import { savePlan, copyPlanMonth, type PlanInput, type PlanPropagation } from "@/app/finance/actions";
import { fmtNumber } from "./A";

const key = (kind: string, cat: string | null, prod: string | null) => `${kind}|${cat ?? ""}|${prod ?? ""}`;

export default function PlanTab({
  month, products, categories, plan, prevMonth, prevHasPlan, lastChange, canManage, planType, switchHrefs, fromUk = false,
}: {
  month: string; products: Prod[]; categories: Cat[]; plan: PlanRow[]; prevMonth: string; prevHasPlan: boolean;
  lastChange: string | null; canManage: boolean;
  /** какой план правим; `plan` уже отфильтрован по нему */
  planType: PlanType;
  /** переключатель «План УК / План партнёра» */
  switchHrefs?: { uk: string; partner: string };
  /** план партнёра на этот месяц ещё не правили — показан план УК */
  fromUk?: boolean;
}) {
  const { locale, t } = useLocale();
  const { currency, rates } = useCurrency();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Round 112: изменённые цены и расходы по умолчанию переносятся во все следующие месяцы
  const [forward, setForward] = useState(true);

  const monthRows = useMemo(() => plan.filter((p) => p.month.slice(0, 7) === month), [plan, month]);
  const toDisplay = (eur: number, local: number | null, cur: string | null) =>
    local !== null && cur === currency ? local : roundMoney(convertFromEur(eur, currency, rates), currency);

  // начальные значения полей: количество / цена за единицу (выручка) и сумма (расходы)
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const r of monthRows) {
      const k = key(r.kind, r.kind === "revenue" ? null : r.category_id, r.product_id);
      if (r.kind === "revenue") {
        const qty = Number(r.qty ?? 0);
        v[`${k}|qty`] = qty ? String(qty) : "";
        const total = toDisplay(r.amount, r.amount_local, r.local_currency);
        v[`${k}|price`] = qty ? String(Math.round((total / qty) * 100) / 100) : String(total);
      } else {
        v[k] = String(toDisplay(r.amount, r.amount_local, r.local_currency));
      }
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRows, currency, rates]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const get = (k: string) => (k in vals ? vals[k] : (initial[k] ?? ""));
  const set = (k: string, v: string) => { setSaved(false); setVals((s) => ({ ...s, [k]: v })); };

  const num = (s: string) => { const n = parseFloat(s.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const priceFor = (p: Prod) => {
    const k = key("revenue", null, p.id);
    const typed = get(`${k}|price`);
    return typed !== "" ? num(typed) : roundMoney(convertFromEur(p.price, currency, rates), currency);
  };

  const groups = categories.filter((c) => !c.parent_id && c.kind === "expense" && !c.archived).sort((a, b) => a.sort - b.sort);
  const leaves = (gid: string) => categories.filter((c) => c.parent_id === gid && !c.archived).sort((a, b) => a.sort - b.sort);

  const toEur = (display: number) => convertToEur(display, currency as never, rates);
  const input = (display: number): Pick<PlanInput, "amountEur" | "amountLocal" | "currency"> => ({
    amountEur: Math.round(toEur(display) * 100) / 100,
    amountLocal: currency === BASE_CURRENCY ? null : display,
    currency: currency === BASE_CURRENCY ? null : currency,
  });

  const collect = (): PlanInput[] => {
    const rows: PlanInput[] = [];
    for (const p of products) {
      const k = key("revenue", null, p.id);
      const qty = num(get(`${k}|qty`));
      if (!qty) continue;
      rows.push({ kind: "revenue", categoryId: null, productId: p.id, qty, ...input(qty * priceFor(p)) });
    }
    for (const g of groups) {
      for (const l of leaves(g.id)) {
        if (l.auto_kind) continue;
        const ids: (string | null)[] = l.per_product ? products.map((p) => p.id) : [null];
        for (const pid of ids) {
          const d = num(get(key("expense", l.id, pid)));
          if (!d) continue;
          rows.push({ kind: "expense", categoryId: l.id, productId: pid, qty: null, ...input(d) });
        }
      }
    }
    return rows;
  };

  /** что поменяли в этом месяце: цены продуктов и суммы статей — для переноса в следующие месяцы */
  const changes = (): PlanPropagation => {
    const out: PlanPropagation = { prices: [], expenses: [] };
    for (const p of products) {
      const k = `${key("revenue", null, p.id)}|price`;
      if (!(k in vals) || vals[k] === "") continue;
      const unit = num(vals[k]);
      if (unit === num(initial[k] ?? "")) continue;
      out.prices.push({ productId: p.id, unitEur: toEur(unit), unitLocal: currency === BASE_CURRENCY ? null : unit, currency: currency === BASE_CURRENCY ? null : currency });
    }
    for (const g of groups) {
      for (const l of leaves(g.id)) {
        if (l.auto_kind) continue;
        for (const pid of l.per_product ? products.map((p) => p.id) : [null]) {
          const k = key("expense", l.id, pid);
          if (!(k in vals)) continue;
          const d = num(vals[k]);
          if (d === num(initial[k] ?? "")) continue;
          out.expenses.push({ categoryId: l.id, productId: pid, ...input(d) });
        }
      }
    }
    return out;
  };

  const cell = "w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60";
  const sym = currencySymbol(currency);
  const revTotal = products.reduce((s, p) => s + num(get(`${key("revenue", null, p.id)}|qty`)) * priceFor(p), 0);

  const run = (fn: () => Promise<{ error: string | null }>, ok?: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r.error) setError(r.error); else { setSaved(true); setVals({}); ok?.(); } });
  };

  return (
    <div className="space-y-4">
      {switchHrefs && (
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border-strong bg-surface-2 p-1">
            {(["uk", "partner"] as const).map((pt) => (
              <Link
                key={pt}
                href={switchHrefs[pt]}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${pt === planType ? "bg-foreground text-background shadow-card" : "text-ink-2 hover:bg-surface-3"}`}
              >
                {pt === "uk" ? t("finPlanTypeUk") : t("finPlanTypePartner")}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted">{planType === "uk" ? t("finPlanTypeHintUk") : t("finPlanTypeHintPartner")}</p>
        </div>
      )}
      <p className="text-sm text-muted">{t("finPlanHint", { m: monthLabel(month, locale) })}</p>
      {fromUk && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{t("finPlanFromUk")}</p>}
      {lastChange && (
        <p className="text-xs text-muted">{t("finPlanLastChange", { d: new Date(lastChange).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU") })}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finSecRevenue")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finPlanQtyCol")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finPlanPriceCol")} ({sym})</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColPlan")} ({sym})</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const k = key("revenue", null, p.id);
              const qty = num(get(`${k}|qty`));
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 text-left">{p.name}</td>
                  <td className="px-3 py-2 text-right"><input disabled={!canManage} inputMode="decimal" className={cell} value={get(`${k}|qty`)} onChange={(e) => set(`${k}|qty`, e.target.value)} /></td>
                  <td className="px-3 py-2 text-right"><input disabled={!canManage} inputMode="decimal" className={cell} placeholder={String(roundMoney(convertFromEur(p.price, currency, rates), currency))} value={get(`${k}|price`)} onChange={(e) => set(`${k}|price`, e.target.value)} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty ? fmtNumber(qty * priceFor(p)) : "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t border-border bg-surface-2 font-semibold">
              <td className="px-3 py-2 text-left" colSpan={3}>{t("finTotalRevenue")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(revTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("finSecExpenses")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("finColPlan")} ({sym})</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentRows key={g.id}>
                <tr><td colSpan={2} className="bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{g.name}{!g.in_pl ? ` · ${t("finNotInPl")}` : ""}</td></tr>
                {leaves(g.id).map((l) =>
                  l.auto_kind ? (
                    <tr key={l.id} className="border-t border-border text-muted">
                      <td className="px-3 py-2 text-left">{l.name}<span className="ml-2 text-[10px]">{t("finAutoHint", { p: Number(l.auto_percent ?? 0) })}</span></td>
                      <td className="px-3 py-2 text-right">{t("finAuto")}</td>
                    </tr>
                  ) : l.per_product ? (
                    <FragmentRows key={l.id}>
                      <tr className="border-t border-border"><td colSpan={2} className="px-3 py-2 text-left text-ink-2">{l.name} <span className="text-xs text-muted">· {t("finPerProductNote")}</span></td></tr>
                      {products.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-3 py-1.5 pl-8 text-left text-ink-2">{p.name}</td>
                          <td className="px-3 py-1.5 text-right"><input disabled={!canManage} inputMode="decimal" className={cell} value={get(key("expense", l.id, p.id))} onChange={(e) => set(key("expense", l.id, p.id), e.target.value)} /></td>
                        </tr>
                      ))}
                    </FragmentRows>
                  ) : (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-1.5 text-left text-ink-2">{l.name}</td>
                      <td className="px-3 py-1.5 text-right"><input disabled={!canManage} inputMode="decimal" className={cell} value={get(key("expense", l.id, null))} onChange={(e) => set(key("expense", l.id, null), e.target.value)} /></td>
                    </tr>
                  )
                )}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending} onClick={() => run(() => savePlan(month, collect(), planType, forward ? changes() : undefined))} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
            {pending ? t("finSaving") : t("finSavePlan")}
          </button>
          {prevHasPlan && (
            <button
              type="button" disabled={pending}
              onClick={() => { if (confirm(t("finCopyConfirm", { m: monthLabel(prevMonth, locale) }))) run(() => copyPlanMonth(prevMonth, month, planType)); }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              {t("finCopyFrom", { m: monthLabel(prevMonth, locale).split(" ")[0] })}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2" title={t("finPlanForwardHint")}>
            <input type="checkbox" checked={forward} onChange={(e) => setForward(e.target.checked)} /> {t("finPlanForward")}
          </label>
          {saved && <span className="text-sm text-muted">✓ {t("finSaved")}</span>}
        </div>
      )}
      {error && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}
      <p className="text-xs text-muted">{t("finPlanFootnote")}</p>
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
