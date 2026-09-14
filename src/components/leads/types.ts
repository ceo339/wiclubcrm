import type { Tables } from "@/types/database";

/** `member_id` is set once this lead has been converted (members.lead_id
 * points back at it) — used to tell the lead card whether "Сделать
 * участницей" would create a first member card or just add another course
 * to the one that already exists (see convertLeadToMember). */
export type Lead = Tables<"leads"> & {
  partner_name: string | null;
  member_id: string | null;
  /** Most recent комментарий left on this lead's card, if any — see the
   * leads page query. Not the whole thread (that's still lazy-loaded only
   * when the card opens), just enough for the board to show at a glance. */
  latest_comment: string | null;
};
