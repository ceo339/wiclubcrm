import { createHmac } from "crypto";

/**
 * DSK Bank (ВПОС) callback notification checksum — round 34.
 *
 * Exact algorithm confirmed by DSK Bank's technical contact and their
 * sandbox documentation (uat.dskbank.bg/sandbox, "Algorithm for processing
 * callback notifications"), symmetric scheme (HMAC-SHA256 with a shared
 * secret key, `DSK_CALLBACK_SECRET` — confirmed as the scheme active on
 * Anastasiia's merchant account, "По подразбиране работим със симетрична
 * схема"):
 *
 * 1. Take every query parameter the bank sent with the notification.
 * 2. Drop `checksum` itself and `sign_alias` (if present) from the set.
 * 3. Sort the remaining parameters alphabetically by name.
 * 4. Build the string "name1;value1;name2;value2;...;nameN;valueN;" —
 *    pairs in that sorted order, the string always ends with a semicolon.
 * 5. HMAC-SHA256 that string with the shared secret key, hex-encode the
 *    result, upper-case it.
 * 6. Compare (case-insensitively, to be safe) to the `checksum` parameter
 *    the bank sent. Equal → authentic notification. Not equal → reject,
 *    never update a payment from it.
 */
export function verifyDskChecksum(params: URLSearchParams, secret: string): boolean {
  const checksum = params.get("checksum");
  if (!checksum) return false;

  const entries: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (key === "checksum" || key === "sign_alias") continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));

  const signedString = entries.map(([key, value]) => `${key};${value};`).join("");

  const computed = createHmac("sha256", secret).update(signedString).digest("hex").toUpperCase();
  return computed === checksum.toUpperCase();
}

/**
 * Whether a verified callback represents a completed (captured) payment.
 * DSK's gateway is the same REST API family as Stripe's counterpart for
 * other banks in this app (register.do / getOrderStatus.do, "AS Sberbank"
 * -style): a one-step ("deposited") capture reports `operation=deposited`
 * with `status=1` once money has actually settled; `approved` alone is
 * only an authorization hold, not a completed payment; `reversed`,
 * `refunded` and `declinedByTimeout` are explicitly not a paid outcome.
 *
 * NOT independently re-verified against a real sandbox payment yet — the
 * checksum algorithm above came directly from DSK's documentation and
 * technical contact (see the project doc), but this exact operation/status
 * convention is the gateway family's documented default rather than a
 * value DSK confirmed for this merchant account specifically. Worth a
 * quick sandbox test before relying on it for real payments.
 */
export function isDskCallbackPaid(params: URLSearchParams): boolean {
  return params.get("operation") === "deposited" && params.get("status") === "1";
}

export type DskOutcome = "paid" | "approved" | "declined" | "refunded" | "other";

/**
 * Round 55: classify a verified callback. `operation` is what happened
 * (approved / deposited / declinedByTimeout / reversed / refunded),
 * `status` 1 = success of that operation, 0 = failure. Still to be
 * confirmed by the bank / a real test payment — integration_events keeps the
 * raw params of every callback, so the mapping can be corrected later.
 */
export function dskOutcome(params: URLSearchParams): DskOutcome {
  const op = (params.get("operation") ?? "").toLowerCase();
  const ok = params.get("status") === "1";
  if (op === "deposited" && ok) return "paid";
  if ((op === "refunded" || op === "reversed") && ok) return "refunded";
  if (op === "approved" && ok) return "approved";
  if (op.startsWith("declined") || !ok) return "declined";
  return "other";
}

/** Amount in EUR if the callback carries one (gateway sends minor units). */
export function dskAmountEur(params: URLSearchParams): number | null {
  const raw = params.get("amount") ?? params.get("depositAmount");
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw) / 100;
}
