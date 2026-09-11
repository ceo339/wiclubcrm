import type { Tables } from "@/types/database";

export type Enrollment = Tables<"member_enrollments"> & {
  product_name: string | null;
  product_price: number | null;
  product_sessions: number | null;
};

/** A member can be enrolled in zero, one, or several courses at once — see
 * member_enrollments. `enrollments` is loaded alongside the member row on
 * the Участницы list; MemberDetailModal fetches its own fresher copy via
 * getMemberDetail (same pattern already used there for comments/tasks). */
export type Member = Tables<"members"> & {
  partner_name: string | null;
  enrollments: Enrollment[];
};
