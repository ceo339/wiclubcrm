"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, type Profile } from "@/lib/auth";
import { getViewScopePartnerId } from "@/lib/viewScope";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignKey } from "@/lib/campaignRules";
import { applyRuleToExistingLeads } from "@/lib/server/campaignRules";
import { fetchAdAccountInfo, normalizeAdAccountId, syncPartnerMetaAds } from "@/lib/metaAds";

export type AdsActionResult = { error: string | null };

/**
 * Which club this caller may manage the Meta connection for: a partner
 * only ever its own club; hq only the one club currently picked in the
 * header city switcher (never "все города" — a token belongs to exactly
 * one club's ad account). Staff/viewer/franchise accounts can't connect or
 * disconnect — the token is effectively a credential of the club owner.
 */
async function manageablePartnerId(profile: Profile): Promise<string | null> {
  if (profile.role === "partner" && profile.partner_id) return profile.partner_id;
  if (profile.role === "hq") return getViewScopePartnerId(profile);
  return null;
}

export async function saveMetaConnection(formData: FormData): Promise<AdsActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };

  const adAccountId = normalizeAdAccountId(String(formData.get("ad_account_id") ?? ""));
  const token = String(formData.get("access_token") ?? "").trim();
  if (!adAccountId) return { error: "adsErrBadAccountId" };
  if (token.length < 20) return { error: "adsErrBadToken" };

  let info: { name: string; currency: string };
  try {
    info = await fetchAdAccountInfo(adAccountId, token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("meta_ad_connections").upsert(
    {
      partner_id: partnerId,
      ad_account_id: adAccountId,
      access_token: token,
      account_name: info.name,
      account_currency: info.currency,
      // A new/replaced account starts over with the full initial backfill.
      last_sync_at: null,
      last_sync_error: null,
      updated_at: now,
    },
    { onConflict: "partner_id" }
  );
  if (error) return { error: error.message };

  const sync = await syncPartnerMetaAds(partnerId);
  revalidatePath("/ads");
  return { error: sync.ok ? null : sync.error };
}

export async function disconnectMeta(): Promise<AdsActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };

  // Only the credential is removed — already-pulled daily numbers stay, so
  // history isn't lost if the club reconnects with a fresh token later.
  const admin = createAdminClient();
  const { error } = await admin.from("meta_ad_connections").delete().eq("partner_id", partnerId);
  revalidatePath("/ads");
  return { error: error?.message ?? null };
}

export async function syncMetaNow(): Promise<AdsActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  // Any account that can see this club's page may refresh its numbers —
  // it reads Meta, it never writes anything there.
  const partnerId = profile.partner_id ?? (await getViewScopePartnerId(profile));
  if (!partnerId) return { error: "errNotAuthorized" };
  const sync = await syncPartnerMetaAds(partnerId);
  revalidatePath("/ads");
  return { error: sync.ok ? null : sync.error };
}

export type RuleActionResult = { error: string | null; updated?: number };

/** Round 76 — правило «кампания → продукт + поток» (см. lib/campaignRules.ts). */
export async function saveCampaignRule(formData: FormData): Promise<RuleActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };

  const campaignName = String(formData.get("campaign_name") ?? "").replace(/\s+/g, " ").trim();
  const productId = String(formData.get("product_id") ?? "");
  const cohortRaw = String(formData.get("cohort_start_date") ?? "");
  if (!campaignName) return { error: "adsRuleErrCampaign" };
  if (!productId) return { error: "adsRuleErrProduct" };

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "adsRuleErrProduct" };

  let cohortStartDate: string | null = null;
  if (cohortRaw) {
    const { data: cohort } = await admin
      .from("product_cohorts")
      .select("start_date")
      .eq("partner_id", partnerId)
      .eq("product_id", productId)
      .eq("start_date", cohortRaw)
      .maybeSingle();
    if (!cohort) return { error: "adsRuleErrCohort" };
    cohortStartDate = cohort.start_date;
  }

  const { error } = await admin.from("campaign_lead_rules").upsert(
    {
      partner_id: partnerId,
      campaign_name: campaignName,
      campaign_key: campaignKey(campaignName),
      product_id: productId,
      cohort_start_date: cohortStartDate,
    },
    { onConflict: "partner_id,campaign_key" }
  );
  if (error) return { error: error.message };
  revalidatePath("/ads");
  return { error: null };
}

export async function deleteCampaignRule(ruleId: string): Promise<RuleActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };

  // Only the rule goes; leads it already placed keep their product/stream.
  const admin = createAdminClient();
  const { error } = await admin.from("campaign_lead_rules").delete().eq("id", ruleId).eq("partner_id", partnerId);
  revalidatePath("/ads");
  return { error: error?.message ?? null };
}

export async function applyCampaignRule(ruleId: string): Promise<RuleActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };

  const admin = createAdminClient();
  const r = await applyRuleToExistingLeads(admin, partnerId, ruleId);
  revalidatePath("/leads");
  revalidatePath("/cohorts");
  revalidatePath("/ads");
  return r;
}
