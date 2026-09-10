"use client";

import { createContext, useContext, type ReactNode, useState } from "react";
import {
  BASE_LOCALE,
  isLocale,
  localeScopeStorageKey,
  t as translate,
  type Locale,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (code: Locale) => void;
  /** Called by <LocaleScope> on every page — see CurrencyProvider's
   * setScope for the identical reasoning. */
  setScope: (scope: string, fallback: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const DEFAULT_SCOPE = "network";

const LocaleContext = createContext<LocaleContextValue>({
  locale: BASE_LOCALE,
  setLocale: () => {},
  setScope: () => {},
  t: (key, vars) => translate(BASE_LOCALE, key, vars),
});

/** Reads a scope's saved language synchronously so the very first client
 * render already matches localStorage — same reasoning as currency's
 * readScoped. Guarded for SSR, where the given fallback is used. */
function readScoped(scope: string, fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(localeScopeStorageKey(scope));
    return isLocale(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Wraps the whole app (see layout.tsx) so every page shares one interface
 * language, tracked per scope (network, or a specific club) just like
 * currency — picking Bulgarian in the header switcher on Sofia's pages is
 * remembered for Sofia, not forced onto every other club.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeName] = useState(DEFAULT_SCOPE);
  const [locale, setLocaleState] = useState<Locale>(() => readScoped(DEFAULT_SCOPE, BASE_LOCALE));

  function setScope(nextScope: string, fallback: Locale) {
    setScopeName(nextScope);
    setLocaleState(readScoped(nextScope, fallback));
  }

  function setLocale(next: Locale) {
    setLocaleState(next);
    try {
      localStorage.setItem(localeScopeStorageKey(scope), next);
    } catch {
      // Choice just won't persist across reloads — not worth failing over.
    }
  }

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        setScope,
        t: (key, vars) => translate(locale, key, vars),
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Convenience for client components that need the raw translated string
 * (placeholders, aria-labels, confirm() dialogs) rather than JSX — use the
 * <T> component instead when the string is plain JSX children. */
export function useT(): LocaleContextValue["t"] {
  return useLocale().t;
}
