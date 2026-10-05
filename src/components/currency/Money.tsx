"use client";

import { formatMoneyExact, type LocalAmount } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

/**
 * Displays an amount that's stored in the database as EUR, converted to
 * whatever currency the header switcher currently has selected. A tiny
 * client leaf component so it can be dropped into a Server Component's JSX
 * (LeadsList, DashboardBoard) without turning the whole page client-side.
 */
export default function Money({
  amountEur,
  fallback = "—",
  local,
}: {
  amountEur: number | null | undefined;
  fallback?: string;
  /** Round 56: the exact amount in the club's own currency, if known. */
  local?: LocalAmount | null;
}) {
  const { currency, rates } = useCurrency();
  if (amountEur === null || amountEur === undefined) return <>{fallback}</>;
  return <>{formatMoneyExact(amountEur, currency, rates, local)}</>;
}
