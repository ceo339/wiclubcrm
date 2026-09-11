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

export const SOURCES = ["Instagram", "Referral", "Website", "Event"] as const;
export type Source = (typeof SOURCES)[number];

const SOURCE_LABEL_KEYS: Record<string, string> = {
  Instagram: "sourceInstagram",
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
// the app. Not a real brand color per platform, just a stable mapping onto
// the app's own accent/ink palette (no new colors introduced).
const SOURCE_COLORS: Record<string, string> = {
  Instagram: "var(--accent)",
  Referral: "var(--accent-strong)",
  Website: "var(--ink-2)",
};

export const sourceColor = (source: string | null) =>
  (source && SOURCE_COLORS[source]) || "var(--muted)";

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
