import type { Tables } from "@/types/database";

export type ContactLead = {
  id: string;
  name: string;
  stage: string;
  added_date: string;
  product_name: string | null;
};

export type ContactEnrollment = {
  id: string;
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
