"use client";

import { convertFromEur, currencySymbol } from "@/lib/currency";
import { toLocal, type Amt } from "@/lib/finance/amt";
import { useCurrency } from "@/components/currency/CurrencyProvider";

/** Число в валюте экрана: точная сумма клуба, если она в этой валюте, иначе пересчёт из EUR. */
export function useAmtNumber(v: Amt): number {
  const { currency, rates } = useCurrency();
  const local = toLocal(v);
  if (local && local.currency === currency) return local.amount ?? 0;
  return convertFromEur(v.eur, currency, rates);
}

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function fmtNumber(n: number): string {
  const abs = Math.abs(n);
  const shown = abs >= 1000 ? Math.round(abs) : Math.round(abs * 100) / 100;
  return nf.format(shown);
}

/** Сумма: «1 875 €». signed — всегда со знаком (для отклонений). */
export function A({ v, signed = false }: { v: Amt; signed?: boolean }) {
  const { currency } = useCurrency();
  const n = useAmtNumber(v);
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return (
    <span className="whitespace-nowrap tabular-nums">
      {sign}
      {fmtNumber(rounded)} {currencySymbol(currency)}
    </span>
  );
}

/** Цвет отклонения: красный — хуже плана. */
export function devClass(diffEur: number, higherIsBad: boolean): string {
  if (Math.abs(diffEur) < 0.005) return "text-muted";
  return (higherIsBad ? diffEur > 0 : diffEur < 0) ? "text-accent-strong font-medium" : "text-foreground";
}

export function pctText(fact: number, plan: number): string {
  if (Math.abs(plan) < 0.005) return "—";
  const p = ((fact - plan) / Math.abs(plan)) * 100;
  const r = Math.round(p);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
}
