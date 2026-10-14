import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { enrollmentNeedsCohort } from "@/lib/members";

/**
 * Round 59 — «Требует внимания» on Главная: things the bank webhook could not finish
 * on its own and that wait for a person.
 *   • unlinkedPayments — paid money not tied to an enrollment (Round 66/67: no service
 *     provided yet, so not revenue) — «Не привязана» in «Оплаты»;
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
  // Round 66/67: paid money that is not tied to an enrollment (a course the participant is
  // enrolled in) — bank payments nobody linked, lead-only payments, payments without a course.
  // It is not revenue until someone links it.
  let unlinkedQuery = db.from("payments").select("id", { count: "exact", head: true }).eq("status", "paid").is("enrollment_id", null);
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
