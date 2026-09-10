"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SOURCES, type StageId } from "@/lib/leads";

export type ActionResult = { error: string | null };

function normalizeSource(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const match = SOURCES.find((s) => s.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
}

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
  const source = normalizeSource(String(formData.get("source") || "Website")) ?? "Website";
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  let productId = String(formData.get("product_id") || "").trim() || null;
  let cohortStartDate = String(formData.get("cohort_start_date") || "").trim() || null;
  const plan = String(formData.get("plan") || "").trim() || null;

  const supabase = await createClient();

  // The product id/cohort date arrive via a hidden form field, so re-verify
  // the product actually belongs to this partner before trusting it.
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) {
      productId = null;
      cohortStartDate = null;
    }
  }

  const { error } = await supabase.from("leads").insert({
    partner_id: profile.partner_id,
    name,
    phone,
    email,
    source,
    value,
    country,
    city,
    birthday,
    product_id: productId,
    cohort_start_date: cohortStartDate,
    plan,
    stage: "new",
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type ImportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  value?: number | null;
};

export type ImportResult = { error: string | null; imported: number };

const MAX_IMPORT_ROWS = 1000;
const IMPORT_CHUNK_SIZE = 200;

/**
 * Bulk-creates leads from parsed CSV rows (see ImportModal). Same RLS rule
 * as createLead — only a partner account (has partner_id) can insert.
 */
export async function importLeads(rows: ImportRow[]): Promise<ImportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано", imported: 0 };
  if (!profile.partner_id) {
    return {
      error: "У аккаунта HQ нет своего клуба — импортировать лиды может только партнёр.",
      imported: 0,
    };
  }

  const clean = rows
    .map((r) => ({
      partner_id: profile.partner_id as string,
      name: (r.name || "").trim(),
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      source: normalizeSource(r.source),
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : 0,
      stage: "new" as const,
    }))
    .filter((r) => r.name.length > 0)
    .slice(0, MAX_IMPORT_ROWS);

  if (clean.length === 0) return { error: "Не найдено ни одной строки с именем", imported: 0 };

  const supabase = await createClient();
  let imported = 0;
  for (let i = 0; i < clean.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = clean.slice(i, i + IMPORT_CHUNK_SIZE);
    const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
    if (error) {
      return {
        error: `Импортировано ${imported} из ${clean.length}, затем ошибка: ${error.message}`,
        imported,
      };
    }
    imported += count ?? chunk.length;
  }

  revalidatePath("/leads");
  return { error: null, imported };
}
