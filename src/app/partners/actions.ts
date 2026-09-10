"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = { error: string | null; tempPassword?: string };

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
  }
  return out;
}

/**
 * HQ-only: creates a new club (partners row) and a real login for it in
 * one step — the franchisee's own city/country IS the club's city/country
 * (confirmed with Anastasia), so this is the single source of truth for
 * both. Uses the service_role admin client so the account is created and
 * email-confirmed immediately, without the franchisee self-registering and
 * without needing a working email provider (which isn't configured yet).
 */
export async function createClubPartner(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (profile.role !== "hq") return { error: "Добавлять клубы может только HQ" };

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!name) return { error: "Укажите название клуба" };
  if (!city) return { error: "Укажите город" };
  if (!country) return { error: "Укажите страну" };
  if (!email) return { error: "Укажите email для входа" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Не настроен серверный ключ Supabase (SUPABASE_SERVICE_ROLE_KEY) — добавьте его в переменные окружения на Vercel.",
    };
  }

  const { data: partner, error: partnerError } = await admin
    .from("partners")
    .insert({ name, city, country })
    .select("id")
    .single();

  if (partnerError) return { error: partnerError.message };

  const tempPassword = generateTempPassword();
  const { error: userError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: "partner",
      partner_id: partner.id,
      full_name: name,
    },
  });

  if (userError) {
    // Don't leave an orphan club with no way to log into it.
    await admin.from("partners").delete().eq("id", partner.id);
    return { error: `Не удалось создать логин: ${userError.message}` };
  }

  revalidatePath("/partners");
  return { error: null, tempPassword };
}

/**
 * HQ-only: edits an existing club's name/country/city. Does not touch the
 * login (email/password) — that's a separate concern handled by Supabase
 * Auth, not this form.
 */
export async function updatePartner(
  partnerId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (profile.role !== "hq") return { error: "Редактировать клубы может только HQ" };

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const country = String(formData.get("country") || "").trim();

  if (!name) return { error: "Укажите название клуба" };
  if (!city) return { error: "Укажите город" };
  if (!country) return { error: "Укажите страну" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Не настроен серверный ключ Supabase (SUPABASE_SERVICE_ROLE_KEY) — добавьте его в переменные окружения на Vercel.",
    };
  }

  const { error } = await admin
    .from("partners")
    .update({ name, city, country })
    .eq("id", partnerId);

  if (error) return { error: error.message };

  revalidatePath("/partners");
  return { error: null };
}
