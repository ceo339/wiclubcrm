"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  BASE_CURRENCY,
  CURRENCY_STORAGE_KEY,
  fetchRates,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  rates: Record<string, number> | null;
  ratesFailed: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: BASE_CURRENCY,
  setCurrency: () => {},
  rates: null,
  ratesFailed: false,
});

/** Reads the saved currency synchronously so the very first client render
 * already matches localStorage — no extra render pass, and no mismatch
 * warning, since React always defers to the client's value for a <select>
 * regardless of what the server rendered. Guarded for SSR, where there's no
 * window/localStorage and the server-rendered default (EUR) is used. */
function initialCurrency(): CurrencyCode {
  if (typeof window === "undefined") return BASE_CURRENCY;
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isCurrencyCode(saved) ? saved : BASE_CURRENCY;
  } catch {
    return BASE_CURRENCY;
  }
}

/**
 * Wraps the whole app (see layout.tsx) so every page shares one selected
 * display currency and one fetched rates table — picking a currency in the
 * header switcher on one page is what every `<Money>` amount reads from.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(initialCurrency);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);

  useEffect(() => {
    fetchRates().then((r) => {
      if (r) setRates(r);
      else setRatesFailed(true);
    });
  }, []);

  function setCurrency(next: CurrencyCode) {
    setCurrencyState(next);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      // Choice just won't persist across reloads — not worth failing over.
    }
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, ratesFailed }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
