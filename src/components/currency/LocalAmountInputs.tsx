"use client";

import { BASE_CURRENCY } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

/**
 * Round 56: for custom money inputs that already submit a hidden EUR value
 * under `name` — also submits the typed amount as-is in the currency on
 * screen (`<name>_local` + `<name>_local_currency`), read on the server by
 * lib/server/localMoney.readLocal. Nothing is rendered when the screen is in
 * EUR.
 */
export default function LocalAmountInputs({ name, value }: { name: string; value: string }) {
  const { currency } = useCurrency();
  if (currency === BASE_CURRENCY) return null;
  return (
    <>
      <input type="hidden" name={`${name}_local`} value={value} />
      <input type="hidden" name={`${name}_local_currency`} value={currency} />
    </>
  );
}
