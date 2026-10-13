import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { enrollmentNeedsCohort } from "@/lib/members";

/**
 * Round 59 — «Требует внимания» on Главная: things the bank webhook could not finish
 * on its own and that wait for a person.
 *   • unlinkedPayments — paid money that is not tied to a participant (bank payments)
 *     or to any course/поток (Round 66) — «Не привязана» in «Оплаты»;
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
  // Two plain filters instead of one nested .or(): (a) a bank payment with no participant,
  // (b) Round 66 — any paid payment tied to neither an enrollment nor a lead (no course/поток,
  // so it is not revenue until someone links it). Unioned by id below.
  let bankUnlinkedQuery = db
    .from("payments")
    .select("id")
    .eq("status", "paid")
    .is("member_id", null)
    .not("dsk_order_id", "is", null);
  let noCourseQuery = db
    .from("payments")
    .select("id")
    .eq("status", "paid")
    .is("enrollment_id", null)
    .is("lead_id", null);
  let enrollmentsQuery = db
    .from("member_enrollments")
    .select("product_id, status, start_date")
    .is("start_date", null)
    .in("status", ["sPaid", "sPartial"])
    .not("product_id", "is", null);
  let cohortsQuery = db.from("product_cohorts").select("product_id");
  if (partnerId) {
    bankUnlinkedQuery = bankUnlinkedQuery.eq("partner_id", partnerId);
    noCourseQuery = noCourseQuery.eq("partner_id", partnerId);
    enrollmentsQuery = enrollmentsQuery.eq("partner_id", partnerId);
    cohortsQuery = cohortsQuery.eq("partner_id", partnerId);
  }
  const [{ data: bankUnlinked }, { data: noCourse }, { data: enrollments }, { data: cohorts }] = await Promise.all([
    bankUnlinkedQuery,
    noCourseQuery,
    enrollmentsQuery,
    cohortsQuery,
  ]);
  const withCohorts = new Set((cohorts ?? []).map((c) => c.product_id));
  return {
    unlinkedPayments: new Set([...(bankUnlinked ?? []), ...(noCourse ?? [])].map((p) => p.id)).size,
    needsCohort: (enrollments ?? []).filter((e) => enrollmentNeedsCohort(e, withCohorts)).length,
  };
}
