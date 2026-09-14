"use client";

import { useEffect, useRef, useState } from "react";
import { convertFromEur, convertToEur, currencySymbol, roundMoney } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

/**
 * A money-entry field that types in whatever currency is currently on
 * screen (see CurrencyProvider) instead of always forcing EUR — "если я
 * выбрала валюту Лари, то я и ввожу везде сумму в этой валюте" (Anastasiia,
 * 14 сен 2026). Everything is still stored in EUR underneath (the one
 * canonical number every report/rollup already assumes) — this field
 * converts at the boundary in both directions: shows an existing EUR
 * amount converted into the selected currency, and submits the typed
 * amount back converted to EUR through a hidden input carrying the real
 * field name — so the surrounding form's handleSubmit/server action needs
 * no changes at all, it still just reads formData.get(name) as before.
 *
 * The visible input is deliberately NOT the one carrying `name`: giving
 * both the same name would submit whichever the browser puts last, and
 * the visible one holds currency-native digits, not EUR.
 */
export default function MoneyAmountField({
  name,
  label,
  defaultAmountEur,
  required,
}: {
  name: string;
  label: string;
  defaultAmountEur: number;
  required?: boolean;
}) {
  const { currency, rates } = useCurrency();
  const [display, setDisplay] = useState(() =>
    String(roundMoney(convertFromEur(defaultAmountEur, currency, rates), currency))
  );
  // Once the person starts typing, live rate updates (or a currency switch
  // mid-edit) must never clobber what they're mid-way through entering.
  const touched = useRef(false);

  useEffect(() => {
    if (touched.current) return;
    setDisplay(String(roundMoney(convertFromEur(defaultAmountEur, currency, rates), currency)));
    // Only re-sync when the conversion inputs change, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, currency, defaultAmountEur]);

  const eurValue = convertToEur(parseFloat(display) || 0, currency, rates);

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">
        {label} ({currencySymbol(currency)})
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        required={required}
        value={display}
        onChange={(e) => {
          touched.current = true;
          setDisplay(e.target.value);
        }}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <input type="hidden" name={name} value={String(eurValue)} />
    </label>
  );
}
