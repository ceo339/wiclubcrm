// Shared constants for the Members feature — mirrors the status vocabulary
// from the prototype (velora-final2.html), minus the demo-only fake
// churn-risk scoring, which wasn't backed by real data.
//
// Ids double as their own dictionary keys (see src/lib/i18n.ts) — already
// distinctive enough not to need a separate labelKey field.
//
// Status, price, dates and attendance all describe one COURSE ENROLLMENT
// (see member_enrollments), not the member as a whole — a member can be
// enrolled in several courses at once, each with its own status/price/
// attendance, since Anastasiia asked to convert one lead into a member of
// two or more courses (11 сен 2026). The functions below are unchanged in
// shape from when they described a single member row; only what they're
// applied to (an enrollment row instead of a member row) has changed.

import { t, type Locale } from "@/lib/i18n";

export type MemberStatus =
  | "sAwaiting"
  | "sPaid"
  | "sFailed"
  | "sCompleted"
  | "sRefunded"
  | "sCancelled";

export const STATUSES: { id: MemberStatus }[] = [
  { id: "sAwaiting" },
  { id: "sPaid" },
  { id: "sCompleted" },
  { id: "sFailed" },
  { id: "sRefunded" },
  { id: "sCancelled" },
];

export const statusLabel = (id: string, locale: Locale) => t(locale, id);

/**
 * Colors an enrollment's real status pill — reusing the same tokens the
 * rest of the app already assigns a meaning to (--accent-soft/--accent-strong
 * for a negative outcome, same as a "declined" lead; --warn-soft/--warn for
 * "waiting on something"; muted for inactive), rather than inventing new
 * colors. Deliberately NOT the prototype's churn-risk pill: that pill's
 * color came from a `churn()` score computed from attendance and, for
 * members with none of its other signals, a hash of the member's own name
 * (`hue(m.n)%5===0`) — not a real risk, and dropped entirely rather than
 * ported (see project doc). Only a real recorded status decides this pill's
 * color here.
 */
export function statusPillClasses(status: string): string {
  switch (status) {
    case "sPaid":
    case "sCompleted":
      return "bg-surface-3 text-ink-2";
    case "sAwaiting":
      return "bg-warn-soft text-warn";
    case "sFailed":
    case "sRefunded":
      return "bg-accent-soft text-accent-strong";
    case "sCancelled":
    default:
      return "bg-surface-2 text-muted";
  }
}

/** "MM.YYYY", matching the prototype's member_since format. */
export function currentMonthYear(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}.${now.getFullYear()}`;
}

/**
 * Normalizes the `attended` jsonb column into a fixed-length array (one slot
 * per session): true = present, false = absent, null = not yet marked.
 * Shared by the per-enrollment card tracker and the group attendance grid so
 * both read the same stored shape the same way.
 */
export function attendedArray(raw: unknown, length: number): (boolean | null)[] {
  const arr = Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: (boolean | null)[] = [];
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    out.push(v === true ? true : v === false ? false : null);
  }
  return out;
}

/** A course with at most one session is a single-day event (a "МК" —
 * мастер-класс — by Anastasiia's own naming convention), where the start
 * date IS the end date; more than one session is a real multi-week "Курс".
 * `sessions` null is treated the same as 1 (no session count recorded yet
 * means nothing to track attendance against, so it can't be a multi-session
 * course in practice). */
export function courseIsSingleSession(sessions: number | null): boolean {
  return (sessions ?? 1) <= 1;
}

/**
 * Whether a "sPaid" enrollment is due to flip to "sCompleted" on its own —
 * Anastasiia's rule (11 сен 2026): a single-session МК finishes the day it
 * starts (there's no separate end date to check, only cohort start_date);
 * a multi-session course finishes once every one of its sessions has an
 * attendance mark, present or absent ("по списку посещаемости" — her
 * words). Only ever fires FROM "sPaid" — every other status (sAwaiting,
 * sFailed, sRefunded, sCancelled, and sCompleted itself) is left alone, so
 * a manual override to any of those is never immediately re-flipped by
 * this check.
 */
export function enrollmentIsDueForCompletion(
  enrollment: { status: string; start_date: string | null; attended: unknown },
  sessions: number | null
): boolean {
  if (enrollment.status !== "sPaid") return false;
  if (courseIsSingleSession(sessions)) {
    if (!enrollment.start_date) return false;
    const today = new Date().toISOString().slice(0, 10);
    return enrollment.start_date <= today;
  }
  const arr = attendedArray(enrollment.attended, sessions ?? 0);
  return arr.length > 0 && arr.every((v) => v !== null);
}
