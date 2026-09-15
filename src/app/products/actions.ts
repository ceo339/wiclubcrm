"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = { error: string | null };

/**
 * Same RLS rule as leads: only a partner account (has partner_id) can
 * write products/cohorts. HQ (partner_id null) is read-only across the
 * whole network.
 */
export async function createProduct(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddCourses" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterCourseName" };

  const priceRaw = String(formData.get("price") || "0").replace(",", ".");
  const price = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0;

  const sessionsRaw = String(formData.get("sessions") || "").trim();
  const sessionsNum = sessionsRaw ? Number(sessionsRaw) : null;
  const sessions = sessionsNum !== null && Number.isFinite(sessionsNum) ? sessionsNum : null;

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    partner_id: profile.partner_id,
    name,
    price,
    sessions,
  });

  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/leads");
  return { error: null };
}

/**
 * "нужно в курсах редактировать карточку курса, стоимость и название"
 * (Anastasiia, 14 сен 2026) — the catalog only ever supported add/delete;
 * fixing a typo in a course name or its price meant deleting and
 * recreating it (losing its cohorts/history along the way). Same
 * partner-scoped write rule as everywhere else.
 */
export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterCourseName" };

  const priceRaw = String(formData.get("price") || "0").replace(",", ".");
  const price = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0;

  const sessionsRaw = String(formData.get("sessions") || "").trim();
  const sessionsNum = sessionsRaw ? Number(sessionsRaw) : null;
  const sessions = sessionsNum !== null && Number.isFinite(sessionsNum) ? sessionsNum : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ name, price, sessions })
    .eq("id", id)
    .eq("partner_id", profile.partner_id);

  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/contacts");
  return { error: null };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/leads");
  return { error: null };
}

export async function addCohort(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const productId = String(formData.get("product_id") || "").trim();
  const startDate = String(formData.get("start_date") || "").trim();
  if (!productId || !startDate) return { error: "errEnterCohortStartDate" };

  const supabase = await createClient();
  const { error } = await supabase.from("product_cohorts").insert({
    partner_id: profile.partner_id,
    product_id: productId,
    start_date: startDate,
  });

  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/leads");
  return { error: null };
}

/**
 * "Нужно добавить возмождность редактирования курса, изменить дату потока"
 * (Anastasiia, 15 сен 2026) — until round 19 the only way to change a
 * поток's date was delete-and-recreate, which orphaned everyone already
 * pointing at the old date string: `leads.cohort_start_date` and
 * `member_enrollments.start_date` are plain date fields, not FKs to
 * `product_cohorts.id`, so nothing would follow a deleted/recreated row
 * anywhere else in the app. She explicitly asked for the edit control in the
 * lead card (not just the Курсы catalog) and for the cascade — "Переносить
 * всех вместе с потоком (рекомендовано)" — so everyone already on the old
 * date (other leads, and already-enrolled/paid participants) moves with it.
 * Guards against landing on a date some other cohort of the same course
 * already occupies, which would otherwise silently merge two distinct
 * потоки together.
 */
export async function rescheduleCohort(cohortId: string, newStartDate: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = newStartDate.trim();
  if (!trimmed) return { error: "errEnterCohortStartDate" };

  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("product_cohorts")
    .select("id, product_id, start_date")
    .eq("id", cohortId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!cohort) return { error: "errCourseNotFound" };
  if (cohort.start_date === trimmed) return { error: null };

  const { data: collision } = await supabase
    .from("product_cohorts")
    .select("id")
    .eq("product_id", cohort.product_id)
    .eq("partner_id", profile.partner_id)
    .eq("start_date", trimmed)
    .neq("id", cohortId)
    .maybeSingle();
  if (collision) return { error: "errCohortDateTaken" };

  const oldDate = cohort.start_date;

  const { error } = await supabase
    .from("product_cohorts")
    .update({ start_date: trimmed })
    .eq("id", cohortId)
    .eq("partner_id", profile.partner_id);
  if (error) return { error: error.message };

  // Move everyone already tied to the old поток with it — matched by
  // partner+product+the exact old date, same scoping every other cascade in
  // this app uses for start_date (reserveAwaitingEnrollment, updateLeadStage).
  await supabase
    .from("leads")
    .update({ cohort_start_date: trimmed })
    .eq("partner_id", profile.partner_id)
    .eq("product_id", cohort.product_id)
    .eq("cohort_start_date", oldDate);

  await supabase
    .from("member_enrollments")
    .update({ start_date: trimmed })
    .eq("partner_id", profile.partner_id)
    .eq("product_id", cohort.product_id)
    .eq("start_date", oldDate);

  revalidatePath("/products");
  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/contacts");
  revalidatePath("/attendance");
  revalidatePath("/");
  return { error: null };
}

export async function deleteCohort(id: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("product_cohorts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/leads");
  return { error: null };
}
