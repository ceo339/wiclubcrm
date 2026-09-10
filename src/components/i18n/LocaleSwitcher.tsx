"use client";

import { LOCALES, type Locale } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/** Header widget — picks the interface language, right next to the
 * currency switcher. Mirrors CurrencySwitcher exactly. */
export default function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label="Язык интерфейса / Език на интерфейса"
      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
