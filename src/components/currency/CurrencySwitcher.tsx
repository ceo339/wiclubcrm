"use client";

import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

/** Header widget — picks the currency every `<Money>` amount on the page
 * displays in. The underlying data is always stored in EUR; this only
 * changes what's shown, using a live rate fetched once per page load. */
export default function CurrencySwitcher() {
  const { currency, setCurrency, ratesFailed } = useCurrency();

  return (
    <div className="flex items-center gap-1.5">
      {ratesFailed && (
        <span className="text-xs text-muted" title="Не удалось получить курс — суммы показаны в евро">
          курс недоступен
        </span>
      )}
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        aria-label="Валюта отображения"
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}
          </option>
        ))}
      </select>
    </div>
  );
}
