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
