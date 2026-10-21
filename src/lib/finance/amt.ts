import type { LocalAmount } from "@/lib/currency";

/**
 * Раздел «Финансы» (раунд 77) — сумма, которая помнит и EUR (каноническая,
 * по ней складывается сеть), и точное значение в валюте клуба (раунд 56:
 * 12 × 35 ₾ всегда дают 420 ₾, а не «419.97 из евро»). `ok` — все слагаемые
 * имели точную сумму в одной валюте; иначе показываем пересчёт из EUR.
 */
export type Amt = {
  eur: number; loc: number; cur: string | null; ok: boolean;
  /** Round 94: сумма в $ по курсу на дату оплаты/расхода; usdOk — у всех слагаемых она была. */
  usd?: number; usdOk?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function zero(): Amt {
  return { eur: 0, loc: 0, cur: null, ok: true, usd: 0, usdOk: true };
}

/** Сумма строки БД (amount + amount_local + local_currency). */
export function amt(eur: unknown, loc?: unknown, cur?: unknown, usd?: unknown): Amt {
  const e = Number(eur) || 0;
  const l = loc === null || loc === undefined || !cur ? NaN : Number(loc);
  const u = usd === null || usd === undefined ? NaN : Number(usd);
  const usdPart = Number.isFinite(u) ? { usd: u, usdOk: true } : { usd: 0, usdOk: e === 0 };
  if (Number.isFinite(l)) return { eur: e, loc: l, cur: String(cur), ok: true, ...usdPart };
  return { eur: e, loc: 0, cur: null, ok: e === 0, ...usdPart };
}

function merge(a: Amt, b: Amt, sign: 1 | -1): Amt {
  const bothCur = a.cur && b.cur;
  const ok = a.ok && b.ok && !(bothCur && a.cur !== b.cur);
  return {
    eur: r2(a.eur + sign * b.eur),
    loc: r2(a.loc + sign * b.loc),
    cur: a.cur ?? b.cur,
    ok,
    usd: r2((a.usd ?? 0) + sign * (b.usd ?? 0)),
    usdOk: (a.usdOk ?? false) && (b.usdOk ?? false),
  };
}

export const add = (a: Amt, b: Amt): Amt => merge(a, b, 1);
export const sub = (a: Amt, b: Amt): Amt => merge(a, b, -1);

export function scale(a: Amt, k: number): Amt {
  return { eur: r2(a.eur * k), loc: r2(a.loc * k), cur: a.cur, ok: a.ok, usd: r2((a.usd ?? 0) * k), usdOk: a.usdOk ?? false };
}

export function sum(items: Amt[]): Amt {
  return items.reduce(add, zero());
}

export const isZero = (a: Amt) => Math.abs(a.eur) < 0.005 && Math.abs(a.loc) < 0.005;

export function toLocal(a: Amt): LocalAmount | null {
  return a.ok && a.cur ? { amount: a.loc, currency: a.cur } : null;
}
