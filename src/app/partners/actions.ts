"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { sendTelegramMessage, validChatId } from "@/lib/server/telegram";
import { startOnboardingForClub } from "@/modules/onboarding/api";

export type ActionResult = {
  error: string | null;
  tempPassword?: string;
  /** Only set when error === "errCreateLoginFailed" — see createClubPartner below. */
  errorDetail?: string;
  /** Only set by resetPartnerPassword/createTeamAccess — the login email
   * the fresh tempPassword above belongs to, so the confirmation screen
   * can show both together even though this form never asked for it. */
  resetEmail?: string | null;
  /** createClubPartner: id онбординга, если он открыт вместе с клубом. */
  onboardingId?: string;
  /** createClubPartner: клуб создан, но онбординг открыть не удалось (ключ перевода). */
  onboardingError?: string;
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
  const replyToEmail = String(formData.get("reply_to_email") || "").trim().toLowerCase();

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
    .insert({ name, city, country, reply_to_email: replyToEmail || null })
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

  // «+ Клуб» сразу открывает онбординг выбранного кандидата из воронки (модуль «Онбординг»).
  // Ошибка здесь клуб не откатывает: клуб и логин уже созданы, онбординг можно открыть потом.
  const candidateId = String(formData.get("candidate_id") || "").trim();
  let onboardingId: string | undefined;
  let onboardingError: string | undefined;
  if (candidateId && formData.get("start_onboarding") === "on") {
    try {
      const r = await startOnboardingForClub({
        candidateId,
        partnerId: partner.id,
        city: [city, country].filter(Boolean).join(" · "),
        startDate: new Date().toISOString().slice(0, 10),
        curator: profile.full_name,
      });
      if ("error" in r) onboardingError = r.error;
      else onboardingId = r.id;
    } catch (e) {
      onboardingError = e instanceof Error ? e.message : "onbErrSave";
    }
    revalidatePath("/onboarding");
  }

  revalidatePath("/partners");
  return { error: null, tempPassword, onboardingId, onboardingError };
}

/**
 * HQ-only: generates a new temporary password for a club's login and sets
 * it directly via the admin API — the CRM-side answer to "где хранятся
 * пароли и где их менять?" (Anastasiia, 15 сен 2026). Before this, the
 * only way to reset a forgotten club password was HQ opening the Supabase
 * dashboard itself (Authentication → Users) — this button does the same
 * thing (admin.auth.admin.updateUserById with a fresh password) without
 * leaving the CRM. The password itself is never stored anywhere in this
 * app's own database, before or after — same as at account creation, it's
 * shown once in the response and then gone.
 */
export async function resetPartnerPassword(partnerId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyResetPassword" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const { data: loginProfile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("role", "partner")
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!loginProfile) return { error: "errNoLoginForClub" };

  const tempPassword = generateTempPassword();
  const { data: userData, error: userError } = await admin.auth.admin.updateUserById(loginProfile.id, {
    password: tempPassword,
  });
  if (userError) return { error: "errCreateLoginFailed", errorDetail: userError.message };

  return { error: null, tempPassword, resetEmail: userData.user?.email ?? null };
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
  const replyToEmail = String(formData.get("reply_to_email") || "").trim().toLowerCase();
  const telegramChatId = String(formData.get("telegram_chat_id") || "").trim();

  if (!name) return { error: "errEnterClubName" };
  if (!city) return { error: "errEnterCity" };
  if (!country) return { error: "errEnterCountry" };
  if (telegramChatId && !validChatId(telegramChatId)) return { error: "errTelegramChatId" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const { error } = await admin
    .from("partners")
    .update({ name, city, country, reply_to_email: replyToEmail || null, telegram_chat_id: telegramChatId || null })
    .eq("id", partnerId);

  if (error) return { error: error.message };

  revalidatePath("/partners");
  return { error: null };
}

/**
 * HQ-only: sends a test message to the chat id typed in the club's card (not yet
 * saved is fine), so the setup is checked before the first real lead arrives.
 */
export async function sendTelegramTest(chatIdRaw: string, clubName: string): Promise<{ error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyEditClubs" };
  const chatId = chatIdRaw.trim();
  if (!chatId || !validChatId(chatId)) return { error: "errTelegramChatId" };
  const result = await sendTelegramMessage(
    chatId,
    `<b>Тест уведомлений · ${clubName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>\n\nСюда будут приходить новые лиды клуба.`
  );
  return result.ok ? { error: null } : { error: result.error };
}
