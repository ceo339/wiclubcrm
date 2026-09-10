"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  BASE_CURRENCY,
  fetchRates,
  isCurrencyCode,
  scopeStorageKey,
  type CurrencyCode,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  rates: Record<string, number> | null;
  ratesFailed: boolean;
  /** Called by <CurrencyScope> on every page to say which club's (or the
   * network's) money is currently on screen, and what it should default to
   * the first time this scope is seen. Switching scope restores that
   * scope's own remembered pick (or its default) — so choosing GEL on
   * Batumi's dashboard doesn't leak into the network summary or Sofia's. */
  setScope: (scope: string, fallback: CurrencyCode) => void;
};

const DEFAULT_SCOPE = "network";

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: BASE_CURRENCY,
  setCurrency: () => {},
  rates: null,
  ratesFailed: false,
  setScope: () => {},
});

/** Reads a scope's saved currency synchronously so the very first client
 * render already matches localStorage — no extra render pass, and no
 * mismatch warning, since React always defers to the client's value for a
 * <select> regardless of what the server rendered. Guarded for SSR, where
 * there's no window/localStorage and the given fallback is used. */
function readScoped(scope: string, fallback: CurrencyCode): CurrencyCode {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(scopeStorageKey(scope));
    return isCurrencyCode(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Wraps the whole app (see layout.tsx) so every page shares one fetched
 * rates table, while the *selected currency* is tracked per scope (network,
 * or a specific club) — picking a currency in the header switcher on one
 * club's page is remembered for that club, not forced onto every other page.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeName] = useState(DEFAULT_SCOPE);
  const [currency, setCurrencyState] = useState<CurrencyCode>(() =>
    readScoped(DEFAULT_SCOPE, BASE_CURRENCY)
  );
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);

  useEffect(() => {
    fetchRates().then((r) => {
      if (r) setRates(r);
      else setRatesFailed(true);
    });
  }, []);

  function setScope(nextScope: string, fallback: CurrencyCode) {
    setScopeName(nextScope);
    setCurrencyState(readScoped(nextScope, fallback));
  }

  function setCurrency(next: CurrencyCode) {
    setCurrencyState(next);
    try {
      localStorage.setItem(scopeStorageKey(scope), next);
    } catch {
      // Choice just won't persist across reloads — not worth failing over.
    }
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, ratesFailed, setScope }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
