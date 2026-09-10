"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/**
 * Invisible — declares "this page belongs to <scope>" to the LocaleProvider
 * so the header switcher defaults to that club's own language (or the
 * network's) and remembers a manual pick separately per scope. Render one
 * of these per page, right next to <LocaleSwitcher> — same pattern as
 * <CurrencyScope>.
 */
export default function LocaleScope({ scope, fallback }: { scope: string; fallback: Locale }) {
  const { setScope } = useLocale();

  useEffect(() => {
    setScope(scope, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, fallback]);

  return null;
}
