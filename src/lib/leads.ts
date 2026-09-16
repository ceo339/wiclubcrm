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
// "Используй такие цвета или похожие для источников лидов. Но так, чтоб
// было визуально видно" (Anastasiia, 15 сен 2026, pointing at the "Воронка
// лидов за период" funnel bars) — the very first pass at this (same day,
// earlier) spread sources across a multi-hue set (gold, slate, coral) for
// maximum contrast; she preferred the funnel's own look instead — one red
// family, light to dark. This is that same family, spread across its full
// light-to-dark range and assigned OUT OF ORDER on purpose, so the five
// sources sit as far apart on the ladder as possible instead of as
// easily-confused neighbours (still visually distinguishable, per her
// "чтоб было видно").
//
// Round 28, часть D — "и там, где лиды тоже сделай более светлые оттенки, а
// то этот бордовый прям выбивается" (Anastasiia, about the same darkest
// stop that made the "Откуда приходят лиды" donut read as one dominant
// near-black wedge). Compressed the whole ladder toward the lighter end —
// same reasoning as HEAT_FROM/HEAT_TO in CohortsBoard.tsx, just applied to
// this shared palette instead of a heatmap: the previous darkest stop
// (#33080d) was close enough to black that a source with a large share (a
// typical Instagram-heavy club) visually swallowed the whole donut.
const SOURCE_COLORS: Record<string, string> = {
  Website: "#fbeaec", // lightest — existing --accent-soft
  Facebook: "#f0b0b8",
  Event: "#e2515f", // existing --warn
  Referral: "#c8102e", // WI Red
  Instagram: "#7a0c1f", // darkest — no longer near-black
};

// Any source outside these five (a raw CSV value, a partner's own channel
// name — see normalizeSource in leads/actions.ts) still gets a real, stable
// color of its own instead of collapsing into one shared "everything else"
// grey — hashed deterministically (so the same string always lands on the
// same swatch, not randomly per page load) into the gaps left between the
// five stops above, so it reads as part of the same red family without
// ever exactly repeating one of the five.
const SOURCE_FALLBACK_GRADIENT = ["#f7d0d5", "#d6737e", "#a30f28", "#5c0e1c"] as const;

function hashSourceIndex(source: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash % mod;
}

export const sourceColor = (source: string | null) => {
  if (!source) return "var(--muted)";
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source];
  const idx = hashSourceIndex(source, SOURCE_FALLBACK_GRADIENT.length);
  return SOURCE_FALLBACK_GRADIENT[idx];
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
