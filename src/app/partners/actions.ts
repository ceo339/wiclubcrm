"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = {
  error: string | null;
  tempPassword?: string;
  /** Only set when error === "errCreateLoginFailed" — see createClubPartner below. */
  errorDetail?: string;
};

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
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyAddClubs" };

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!name) return { error: "errEnterClubName" };
  if (!city) return { error: "errEnterCity" };
  if (!country) return { error: "errEnterCountry" };
  if (!email) return { error: "errEnterLoginEmail" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
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
    return { error: "errCreateLoginFailed", errorDetail: userError.message };
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
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyEditClubs" };

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const country = String(formData.get("country") || "").trim();

  if (!name) return { error: "errEnterClubName" };
  if (!city) return { error: "errEnterCity" };
  if (!country) return { error: "errEnterCountry" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const { error } = await admin
    .from("partners")
    .update({ name, city, country })
    .eq("id", partnerId);

  if (error) return { error: error.message };

  revalidatePath("/partners");
  return { error: null };
}
