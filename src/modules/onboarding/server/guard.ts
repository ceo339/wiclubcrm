import { getCurrentProfile, type Profile } from "@/lib/auth";
import { canManageOnboarding, canMarkOnboarding, canViewOnboarding } from "../access";
import { onboardingWriteDb } from "./db";

export type Level = "view" | "mark" | "manage";

/** Серверная проверка доступа: страница и начало каждого серверного действия. */
export async function requireOnboardingAccess(level: Level): Promise<{ profile: Profile } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const ok =
    level === "view" ? canViewOnboarding(profile.role) : level === "mark" ? canMarkOnboarding(profile.role) : canManageOnboarding(profile.role);
  if (!ok) return { error: "errNotAuthorized" };
  return { profile };
}

/**
 * Можно ли этому пользователю трогать данный онбординг: hq любой,
 * партнер только свой (onboardings.partner_id = его клуб).
 */
export async function ownsOnboarding(profile: Profile, onboardingId: string): Promise<boolean> {
  if (profile.role === "hq") return true;
  if (profile.role !== "partner" || !profile.partner_id) return false;
  const { data } = await onboardingWriteDb().from("onboardings").select("partner_id").eq("id", onboardingId).maybeSingle();
  return !!data && data.partner_id === profile.partner_id;
}
