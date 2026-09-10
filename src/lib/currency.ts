// Multi-currency display — ported from the prototype's CURRENCIES /
// live-rate / localStorage switcher. Every amount is still stored and
// entered in EUR (the actual business currency for every real club so
// far, including Sofia now that Bulgaria is on the euro) — this only
// changes how an amount is *displayed*, exactly like the prototype did.

import { clubScopeForProfile } from "@/lib/scope";

export type CurrencyCode = "EUR" | "USD" | "GEL" | "UAH";

export const CURRENCIES: { code: CurrencyCode; symbol: string }[] = [
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "GEL", symbol: "₾" },
  { code: "UAH", symbol: "₴" },
];

/** Every amount in the database is stored in this currency. */
export const BASE_CURRENCY: CurrencyCode = "EUR";

export const CURRENCY_STORAGE_KEY = "wiclub_currency";

/** The saved choice is scoped (see CurrencyProvider) so that switching
 * currency on one club's pages doesn't leak into another club's or into the
 * network summary — each scope remembers its own pick independently. */
export function scopeStorageKey(scope: string): string {
  return `${CURRENCY_STORAGE_KEY}:${scope}`;
}

/**
 * The currency a club's own country normally trades in — used as the
 * *default* display currency for that club (Georgia's lari, Bulgaria's
 * euro, Ukraine's hryvnia). Anastasiia confirmed this mapping directly;
 * any country not listed here (no real club operates there yet) falls
 * back to EUR. Separate from the network-wide rollup default (dollars,
 * see scopeForProfile) — that's about a mixed multi-club total, not any
 * one country's own currency.
 */
export const COUNTRY_CURRENCY: Record<string, CurrencyCode> = {
  Georgia: "GEL",
  Bulgaria: "EUR",
  Ukraine: "UAH",
};

export function currencyForCountry(country: string | null | undefined): CurrencyCode {
  if (!country) return BASE_CURRENCY;
  return COUNTRY_CURRENCY[country] ?? BASE_CURRENCY;
}

/**
 * Picks the currency scope+default for a page from the signed-in profile:
 * a partner/staff account sees its own club's currency everywhere it goes,
 * while hq (whose lists mix every club together) sees the network default
 * (dollars). Pages that show one specific club regardless of who's looking
 * (a club's own dashboard, one club's attendance stream) build their own
 * `club:<id>` scope directly instead, since it doesn't depend on the viewer.
 */
export function scopeForProfile(profile: {
  role: string;
  partner_id: string | null;
  partner_country: string | null;
}): { scope: string; fallback: CurrencyCode } {
  const scope = clubScopeForProfile(profile);
  const fallback = scope === "network" ? "USD" : currencyForCountry(profile.partner_country);
  return { scope, fallback };
}

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
