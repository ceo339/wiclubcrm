/**
 * Round 62 — forgiving phone / Telegram matching for the search boxes.
 * «+380 67 487 09 75» used to find nothing: the phone is stored as typed on the
 * application form («+380674870975», «87770021721 (Ватсапп)», «+7 7027023570»),
 * and the search compared raw text. Pure helpers, no imports.
 */

/** Digits only: «+380 (67) 487-09-75» → «380674870975». */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** True when the search text looks like a phone number (digits and phone punctuation, no letters). */
export function looksLikePhone(query: string): boolean {
  const q = query.trim();
  return /^[\d\s+().\-–]+$/.test(q) && digitsOnly(q).length >= 3;
}

/** Phone match ignoring spaces, dashes, brackets and a leading + / 00; the typed digits may be any part of the number. */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  if (!phone) return false;
  if (phone.toLowerCase().includes(query.trim().toLowerCase())) return true;
  if (!looksLikePhone(query)) return false;
  let q = digitsOnly(query);
  if (q.startsWith("00") && q.length > 5) q = q.slice(2);
  return digitsOnly(phone).includes(q);
}

/** «@name», «name», «t.me/name», «https://t.me/name» → «name» (lower case). */
export function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?(t\.me|telegram\.me)\//, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

/** Telegram match: «@Lana_2603», «lana_2603» and «lana» all find «@Lana_2603»; a link works too. */
export function telegramMatches(telegram: string | null | undefined, query: string): boolean {
  const handle = normalizeHandle(telegram);
  const q = normalizeHandle(query);
  if (!handle || !q) return false;
  return handle.includes(q);
}
