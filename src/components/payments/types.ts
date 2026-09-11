import type { Tables } from "@/types/database";

export type Payment = Tables<"payments"> & {
  partner_name: string | null;
  member_name: string | null;
  product_name: string | null;
  /** Set only when this payment has no member yet (a lead that reached
   * "Оплата" before being converted) — display falls back to this name. */
  lead_name: string | null;
};

/**
 * One row per thing a payment can be logged against: a member's specific
 * course enrollment (most common — a member with 2 courses shows up here
 * twice, once per course, each with its own default price), or, for a
 * member with no course at all yet, the bare member. `key` is what the
 * <select> actually submits — see parsePaymentTarget in app/payments/actions.
 */
export type MemberOption = {
  key: string;
  memberId: string;
  enrollmentId: string | null;
  label: string;
  defaultAmount: number | null;
};
