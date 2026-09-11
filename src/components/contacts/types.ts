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
