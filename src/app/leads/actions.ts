"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { StageId } from "@/lib/leads";

export type ActionResult = { error: string | null };

/**
 * Moves a lead to a new stage. RLS enforces that only the owning partner
 * can write to a lead — an HQ account (no partner_id) will simply be
 * rejected by the database, which is the correct behaviour (HQ is a
 * read-only aggregate view for now).
 */
export async function updateLeadStage(
  leadId: string,
  stage: StageId,
  decline?: { reason: string; note: string | null }
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      stage,
      decline_reason: stage === "declined" ? decline?.reason ?? null : null,
      decline_note: stage === "declined" ? decline?.note ?? null : null,
    })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — добавлять лиды может только партнёр." };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Укажите имя" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const source = String(formData.get("source") || "Website");
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    partner_id: profile.partner_id,
    name,
    phone,
    email,
    source,
    value,
    stage: "new",
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}
