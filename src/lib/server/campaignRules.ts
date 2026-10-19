import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignKey } from "@/lib/campaignRules";

export type CampaignRuleTarget = {
  productId: string;
  productPrice: number | null;
  cohortStartDate: string | null;
};

/**
 * Правило для кампании клуба. Ничего не доверяет вслепую: если продукт
 * правила уже удалён — правила нет; если поток удалён из «Потоков» —
 * заявка получит продукт, но без потока (как и при ручном вводе).
 */
export async function findCampaignRule(
  admin: SupabaseClient,
  partnerId: string,
  campaign: string | null
): Promise<CampaignRuleTarget | null> {
  const key = campaignKey(campaign);
  if (!key) return null;

  const { data: rule } = await admin
    .from("campaign_lead_rules")
    .select("product_id, cohort_start_date")
    .eq("partner_id", partnerId)
    .eq("campaign_key", key)
    .maybeSingle();
  if (!rule) return null;

  const { data: product } = await admin
    .from("products")
    .select("id, price")
    .eq("partner_id", partnerId)
    .eq("id", rule.product_id)
    .maybeSingle();
  if (!product) return null;

  let cohortStartDate: string | null = null;
  if (rule.cohort_start_date) {
    const { data: cohort } = await admin
      .from("product_cohorts")
      .select("start_date")
      .eq("partner_id", partnerId)
      .eq("product_id", product.id)
      .eq("start_date", rule.cohort_start_date)
      .maybeSingle();
    cohortStartDate = cohort?.start_date ?? null;
  }

  return {
    productId: product.id,
    productPrice: product.price !== null && product.price !== undefined ? Number(product.price) : null,
    cohortStartDate,
  };
}

/**
 * Применяет правило к уже существующим заявкам кампании. Трогает только
 * заявки «Новая» / «В работе»: оплаченные, отказанные и со счётом остаются
 * как есть. Продукт ставит только там, где его не было; у заявок, уже
 * выбравших ЭТОТ ЖЕ продукт, добавляет только пустой поток. Заявку с другим
 * продуктом не трогает. Цену берёт из каталога, только если у заявки 0.
 */
export async function applyRuleToExistingLeads(
  admin: SupabaseClient,
  partnerId: string,
  ruleId: string
): Promise<{ error: string | null; updated: number }> {
  const { data: rule } = await admin
    .from("campaign_lead_rules")
    .select("id, campaign_key")
    .eq("partner_id", partnerId)
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule) return { error: "adsRuleNotFound", updated: 0 };

  const target = await findCampaignRule(admin, partnerId, rule.campaign_key);
  if (!target) return { error: "adsRuleProductGone", updated: 0 };

  const { data: leads, error } = await admin
    .from("leads")
    .select("id, utm_campaign, product_id, cohort_start_date, value, value_local, stage")
    .eq("partner_id", partnerId)
    .not("utm_campaign", "is", null)
    .in("stage", ["new", "progress"]);
  if (error) return { error: error.message, updated: 0 };

  let updated = 0;
  for (const l of leads ?? []) {
    if (campaignKey(l.utm_campaign) !== rule.campaign_key) continue;

    const patch: Record<string, unknown> = {};
    if (!l.product_id) {
      patch.product_id = target.productId;
      patch.cohort_start_date = target.cohortStartDate;
      if (!Number(l.value) && !l.value_local && target.productPrice !== null) patch.value = target.productPrice;
    } else if (l.product_id === target.productId && !l.cohort_start_date && target.cohortStartDate) {
      patch.cohort_start_date = target.cohortStartDate;
    } else {
      continue;
    }

    const { error: upErr } = await admin.from("leads").update(patch).eq("id", l.id).eq("partner_id", partnerId);
    if (upErr) return { error: upErr.message, updated };
    updated += 1;
  }
  return { error: null, updated };
}
