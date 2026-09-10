"use client";

import { useEffect } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

/**
 * Invisible — declares "this page is showing <scope>'s money" to the
 * CurrencyProvider so the header switcher defaults to that club's own
 * currency (or the network's) and remembers a manual pick separately per
 * scope. Render one of these per page, right next to <CurrencySwitcher>.
 */
export default function CurrencyScope({
  scope,
  fallback,
}: {
  scope: string;
  fallback: CurrencyCode;
}) {
  const { setScope } = useCurrency();

  useEffect(() => {
    setScope(scope, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, fallback]);

  return null;
}
