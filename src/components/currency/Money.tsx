"use client";

import { formatMoney } from "@/lib/currency";
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
}: {
  amountEur: number | null | undefined;
  fallback?: string;
}) {
  const { currency, rates } = useCurrency();
  if (amountEur === null || amountEur === undefined) return <>{fallback}</>;
  return <>{formatMoney(amountEur, currency, rates)}</>;
}
