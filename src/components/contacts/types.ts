import type { Tables } from "@/types/database";

export type ContactLead = {
  id: string;
  name: string;
  stage: string;
  added_date: string;
  product_id: string | null;
  product_name: string | null;
  /** The course/stream this заявка was offered, if one was chosen — used
   * for the "поток" filter (same field as leads.cohort_start_date). */
  cohort_start_date: string | null;
};

export type ContactEnrollment = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  status: string;
  start_date: string | null;
  price: number;
};

/** One row per Контакт — the canonical person record a lead (заявка) and a
 * member both point to. `leads`/`enrollments` are this contact's full
 * cross-history regardless of which specific lead/member row they came
 * from — see project doc on the Contacts round. */
export type Contact = Tables<"contacts"> & {
  partner_name: string | null;
  member_id: string | null;
  member_since: string | null;
  leads: ContactLead[];
  enrollments: ContactEnrollment[];
};

// "в контактах показывать оплату каждого курса и общую за контакт, и в
// списке добавить этот столбик" (Anastasiia, 16 сен 2026) — the per-course
// amount already renders in the card (ContactEnrollmentsList shows
// `enrollment.price` on every row), so the only real gap was a TOTAL. Only
// actually-paid enrollments count towards it — same rule MembersBoard's own
// "Оплатили: X из Y" summary already uses (`sPaid`/`sCompleted`) — so a
// course she's merely signed up for but hasn't paid ("Ожидание") doesn't
// inflate the number; its own price still shows on its own row, just not
// folded into this total.
const PAID_ENROLLMENT_STATUSES = new Set(["sPaid", "sCompleted"]);

export function contactPaidTotal(enrollments: ContactEnrollment[]): number {
  return enrollments
    .filter((e) => PAID_ENROLLMENT_STATUSES.has(e.status))
    .reduce((sum, e) => sum + (e.price || 0), 0);
}
