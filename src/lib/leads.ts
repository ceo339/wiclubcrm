// Shared constants for the Leads feature — mirrors the stage/source/decline
// vocabulary from the prototype (velora-final2.html) so behaviour and
// wording stay consistent between the demo and the real app.
//
// Labels are stored as dictionary keys (see src/lib/i18n.ts), not literal
// Russian text — every call site passes the current locale explicitly,
// since these are plain functions with no access to React context.

import { t, type Locale } from "@/lib/i18n";

export type StageId =
  | "new"
  | "progress"
  | "presented"
  | "invoiced"
  | "paid"
  | "declined";

export const STAGES: { id: StageId; labelKey: string; prob: number; won?: boolean; lost?: boolean }[] = [
  { id: "new", labelKey: "stageNew", prob: 10 },
  { id: "progress", labelKey: "stageProgress", prob: 25 },
  { id: "presented", labelKey: "stagePresented", prob: 45 },
  { id: "invoiced", labelKey: "stageInvoiced", prob: 70 },
  { id: "paid", labelKey: "stagePaid", prob: 100, won: true },
  { id: "declined", labelKey: "stageDeclined", prob: 0, lost: true },
];

export const stageLabel = (id: string, locale: Locale) => {
  const key = STAGES.find((s) => s.id === id)?.labelKey;
  return key ? t(locale, key) : id;
};

// "Facebook" added 12 сен 2026 for the landing-page intake module (see
// src/app/api/leads/intake/[key]/route.ts) — her Meta ad campaigns run on
// both Instagram and Facebook placements, and utm_source on a Facebook
// click needs a real bucket to land in instead of falling back to
// "Website".
export const SOURCES = ["Instagram", "Facebook", "Referral", "Website", "Event"] as const;
export type Source = (typeof SOURCES)[number];

const SOURCE_LABEL_KEYS: Record<string, string> = {
  Instagram: "sourceInstagram",
  Facebook: "sourceFacebook",
  Referral: "sourceReferral",
  Website: "sourceWebsite",
  Event: "sourceEvent",
};

export const sourceLabel = (source: string, locale: Locale) => {
  const key = SOURCE_LABEL_KEYS[source];
  return key ? t(locale, key) : source;
};

// One fixed color per source, reused everywhere a source needs a swatch —
// the kanban card dot, the "Откуда приходят лиды" donut, and the channel
// bar list on Home — so a given source always reads the same color across
// the app.
//
// "сделай градиент из цветов, чтоб нагляднее было видно" (Anastasiia, 15
// сен 2026) — the previous 4-color set (three near-identical reds plus one
// grey fallback) made both charts hard to read at a glance: "Event" had no
// color of its own at all and silently shared the same grey as "unknown",
// and Instagram/Facebook/Referral were all just shades of the same red
// against an already-red-branded UI. This spreads every source across a
// real gradient — deep maroon through gold to a cool slate — so each one is
// instantly distinguishable, while staying inside colors already used
// elsewhere in the app (--warn, --muted, --ink-2) plus a couple of new
// stops in the same warm/earthy family. A source outside the five built-in
// ones (a raw CSV value, a partner's own channel name — see normalizeSource
// in leads/actions.ts) still gets a real, stable color of its own, hashed
// deterministically into the same gradient, instead of collapsing into one
// shared "everything else" grey.
const SOURCE_GRADIENT = [
  "#7a0c1f", // deep maroon
  "#c8102e", // brand accent red
  "#eab454", // warm gold
  "#5c6b73", // slate (cool neutral, max contrast against the reds)
  "#f2896b", // coral
  "#9e6b3f", // warm bronze
  "#847b6d", // existing --muted tan
  "#2b2b2b", // existing --ink-2 charcoal
] as const;

const SOURCE_COLORS: Record<string, string> = {
  Instagram: SOURCE_GRADIENT[0],
  Facebook: SOURCE_GRADIENT[2],
  Referral: SOURCE_GRADIENT[1],
  Website: SOURCE_GRADIENT[3],
  Event: SOURCE_GRADIENT[4],
};

// Deterministic string → stable index, so a given custom source string
// always lands on the same color across renders and sessions (not random
// per page load).
function hashSourceIndex(source: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash % mod;
}

const FALLBACK_START = 5; // SOURCE_GRADIENT slots not already claimed above

export const sourceColor = (source: string | null) => {
  if (!source) return "var(--muted)";
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source];
  const idx = FALLBACK_START + hashSourceIndex(source, SOURCE_GRADIENT.length - FALLBACK_START);
  return SOURCE_GRADIENT[idx];
};

/**
 * Linear RGB interpolation between two hex colors — used to paint the
 * "Воронка лидов за период" funnel bars (DashboardBoard) as a real gradient
 * from the widest (first) stage to the narrowest (last), instead of the
 * previous flat single-color-per-bar look where only the very last bar
 * ("Оплата") stood out.
 */
export function interpolateHex(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const f = parseInt(from.slice(1), 16);
  const to255 = parseInt(to.slice(1), 16);
  const fr = (f >> 16) & 255;
  const fg = (f >> 8) & 255;
  const fb = f & 255;
  const tr = (to255 >> 16) & 255;
  const tg = (to255 >> 8) & 255;
  const tb = to255 & 255;
  const r = Math.round(fr + (tr - fr) * clamped);
  const g = Math.round(fg + (tg - fg) * clamped);
  const b = Math.round(fb + (tb - fb) * clamped);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The real, disclosed number behind the Leads page's "Высокая ценность"
 * filter — a plain threshold on the lead's own value field, not a hidden
 * score. Chosen to sit between the app's own generic plan prices (see
 * GENERIC_PLANS above): above the course/monthly plans, at/below annual
 * membership and coaching. */
export const HIGH_VALUE_THRESHOLD = 1000;

// Decline-reason ids double as their own dictionary keys — already
// distinctive enough (declineNoMoney, declineExpensive, …) not to need a
// separate labelKey field.
export const DECLINE_REASONS = [
  "declineNoMoney",
  "declineExpensive",
  "declineNoTime",
  "declineNotRelevant",
  "declineNotInCity",
  "declineOther",
] as const;

export const declineReasonLabel = (id: string | null, locale: Locale) =>
  id ? t(locale, id) : "";

// Country list + default city, mirrors the prototype's COUNTRIES array
// (velora-final2.html) so the Add Lead form behaves the same way. Country
// names are proper nouns and stay as-is regardless of interface language —
// not part of this round's translation.
export const COUNTRIES: { name: string; city?: string }[] = [
  { name: "Sweden" },
  { name: "USA" },
  { name: "United Kingdom" },
  { name: "Germany" },
  { name: "France" },
  { name: "Italy" },
  { name: "Latvia" },
  { name: "Denmark" },
  { name: "Ukraine" },
  { name: "Georgia", city: "Batumi" },
  { name: "Bulgaria", city: "Sofia" },
];

/** Looks up a country's default city from COUNTRIES (e.g. Bulgaria ->
 * Sofia, Georgia -> Batumi) — shared by the country <select>'s own
 * on-change handler and by whatever pre-fills country/city for a lead
 * before the person has touched the field (new-lead default from the
 * signed-in club's own country; falling back to it on an existing lead
 * that has neither set — see NewLeadModal/LeadDetailModal). */
export function countryDefaultCity(name: string | null | undefined): string | null {
  if (!name) return null;
  return COUNTRIES.find((c) => c.name === name)?.city ?? null;
}

// Generic membership/course plans offered when a lead isn't tied to a real
// product yet — mirrors the prototype's "Интересует" fallback dropdown.
// Ids double as their own dictionary keys, same reasoning as decline reasons.
export const GENERIC_PLANS: { id: string; price: number }[] = [
  { id: "planAnnual", price: 1200 },
  { id: "planMonthly", price: 520 },
  { id: "planCourse", price: 390 },
  { id: "planCoaching", price: 850 },
];

export const genericPlanLabel = (id: string, locale: Locale) => t(locale, id);

// ---- duplicate detection ----
// Anastasiia's rule, verbatim: check by email first, then by phone number.
// Read as a single-key lookup (not "check both and OR the results") — if a
// lead has an email, that email is its identity for matching purposes;
// phone is only consulted when there's no email to go on. Used identically
// by createLead/importLeads (server/leads/actions.ts) and the HQ duplicate
// finder, so all three agree on what counts as "the same lead".

/** Trimmed + lowercased, or null if empty — so two blank emails never
 * "match" each other. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed || null;
}

/** Digits only (a leading "+", spaces, dashes and parentheses are just
 * formatting, not part of the number's identity). Requires at least 5
 * digits so short/garbage input never collides with another short value. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

export type DuplicateField = "email" | "phone";

/** The single key used to decide whether two leads are "the same lead" —
 * email if present, otherwise phone, otherwise no key at all (nothing to
 * compare, never treated as a duplicate). */
export function duplicateKey(
  email: string | null | undefined,
  phone: string | null | undefined
): { field: DuplicateField; value: string } | null {
  const normEmail = normalizeEmail(email);
  if (normEmail) return { field: "email", value: normEmail };
  const normPhone = normalizePhone(phone);
  if (normPhone) return { field: "phone", value: normPhone };
  return null;
}
