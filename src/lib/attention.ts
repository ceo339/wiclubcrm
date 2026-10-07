import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { enrollmentNeedsCohort } from "@/lib/members";

/**
 * Round 59 — «Требует внимания» on Главная: things the bank webhook could not finish
 * on its own and that wait for a person.
 *   • unlinkedPayments — money the bank confirmed (dsk_order_id set) that is not tied
 *     to any participant yet («Не привязана» in «Оплаты»);
 *   • needsCohort — paid participants whose поток is not chosen («Выберите поток»).
 * `partnerId` = one club; null = the whole network (what hq/viewer can see).
 * Both are plain counts read live — nothing stored, so they vanish the moment the
 * club fixes the row.
 */
export type AttentionCounts = { unlinkedPayments: number; needsCohort: number };

export async function loadAttentionCounts(
  db: SupabaseClient<Database>,
  partnerId: string | null
): Promise<AttentionCounts> {
  let unlinkedQuery = db
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .is("member_id", null)
    .not("dsk_order_id", "is", null);
  let enrollmentsQuery = db
    .from("member_enrollments")
    .select("product_id, status, start_date")
    .is("start_date", null)
    .in("status", ["sPaid", "sPartial"])
    .not("product_id", "is", null);
  let cohortsQuery = db.from("product_cohorts").select("product_id");
  if (partnerId) {
    unlinkedQuery = unlinkedQuery.eq("partner_id", partnerId);
    enrollmentsQuery = enrollmentsQuery.eq("partner_id", partnerId);
    cohortsQuery = cohortsQuery.eq("partner_id", partnerId);
  }
  const [{ count }, { data: enrollments }, { data: cohorts }] = await Promise.all([
    unlinkedQuery,
    enrollmentsQuery,
    cohortsQuery,
  ]);
  const withCohorts = new Set((cohorts ?? []).map((c) => c.product_id));
  return {
    unlinkedPayments: count ?? 0,
    needsCohort: (enrollments ?? []).filter((e) => enrollmentNeedsCohort(e, withCohorts)).length,
  };
}
