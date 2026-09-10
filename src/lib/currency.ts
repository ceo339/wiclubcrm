// Multi-currency display — ported from the prototype's CURRENCIES /
// live-rate / localStorage switcher. Every amount is still stored and
// entered in EUR (the actual business currency for every real club so
// far, including Sofia now that Bulgaria is on the euro) — this only
// changes how an amount is *displayed*, exactly like the prototype did.

export type CurrencyCode = "EUR" | "USD" | "GEL";

export const CURRENCIES: { code: CurrencyCode; symbol: string }[] = [
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "GEL", symbol: "₾" },
];

/** Every amount in the database is stored in this currency. */
export const BASE_CURRENCY: CurrencyCode = "EUR";

export const CURRENCY_STORAGE_KEY = "wiclub_currency";

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return !!value && CURRENCIES.some((c) => c.code === value);
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/**
 * EUR -> target currency, using a live rates table (EUR-based, as returned
 * by `fetchRates`). Falls back to the raw EUR amount when the rate isn't
 * available yet (still loading, or the request failed) — the app should
 * never block on a network call, it just briefly shows euros.
 */
export function convertFromEur(
  amountEur: number,
  target: CurrencyCode,
  rates: Record<string, number> | null
): number {
  if (target === BASE_CURRENCY || !rates || !rates[target]) return amountEur;
  return amountEur * rates[target];
}

export function formatMoney(
  amountEur: number,
  target: CurrencyCode,
  rates: Record<string, number> | null
): string {
  const converted = convertFromEur(amountEur, target, rates);
  return `${currencySymbol(target)}${Math.round(converted)}`;
}

const RATES_ENDPOINT = "https://open.er-api.com/v6/latest/EUR";

/** Returns null on any failure (network, bad response) rather than
 * throwing — callers fall back to displaying plain EUR amounts. */
export async function fetchRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(RATES_ENDPOINT);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      (data as { result?: string }).result !== "success" ||
      typeof (data as { rates?: unknown }).rates !== "object"
    ) {
      return null;
    }
    return (data as { rates: Record<string, number> }).rates;
  } catch {
    return null;
  }
}
