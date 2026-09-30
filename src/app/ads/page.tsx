import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId, getViewMode } from "@/lib/viewScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import AdsBoard, { type AdsConnectionInfo } from "@/components/ads/AdsBoard";

/** How far back the page loads daily rows — the board then filters
 * client-side (presets up to "всё время" within this window). */
const HISTORY_DAYS = 400;

export default async function AdsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);
  const viewMode = await getViewMode(profile);
  // The one club this page is about, if any: a partner's own, or the club
  // an hq/viewer picked in the header switcher. Null = network-wide view.
  const clubId = profile.partner_id ?? scopePartnerId;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - HISTORY_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  let insightsQuery = supabase
    .from("ad_insights_daily")
    .select("partner_id, date, campaign_id, campaign_name, spend, impressions, clicks, leads, currency")
    .gte("date", sinceIso)
    .order("date", { ascending: true });
  if (scopePartnerId) insightsQuery = insightsQuery.eq("partner_id", scopePartnerId);

  // CRM side of the same campaigns: Lead Ads leads arrive with the Meta
  // campaign name in utm_campaign (Google Sheets export → intake webhook,
  // round 11), so they can be matched to spend by name.
  let leadsQuery = supabase
    .from("leads")
    .select("utm_campaign, added_date, stage")
    .not("utm_campaign", "is", null)
    .gte("added_date", sinceIso);
  if (scopePartnerId) leadsQuery = leadsQuery.eq("partner_id", scopePartnerId);

  const [{ data: insights, error }, { data: crmLeads }] = await Promise.all([insightsQuery, leadsQuery]);

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  // Connection status is read with the admin client (the table has no RLS
  // policies because it holds the token) — only non-secret columns leave
  // this server component; the token itself never does.
  let connection: AdsConnectionInfo | null = null;
  if (clubId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("meta_ad_connections")
      .select("ad_account_id, account_name, account_currency, last_sync_at, last_sync_error")
      .eq("partner_id", clubId)
      .maybeSingle();
    connection = data ?? null;
  }

  const canManage = (profile.role === "partner" && !!profile.partner_id) || (profile.role === "hq" && !!scopePartnerId);
  const localeScope = localeScopeForProfile(profile);

  return (
    <AppShell
      profile={profile}
      title={<T k="navAds" />}
      subtitle={<T k="adsSubtitle" />}
      clubs={clubs ?? []}
      activeClubId={scopePartnerId}
      viewMode={viewMode}
      headerExtra={
        <>
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">{error.message}</p>
      ) : (
        <AdsBoard
          rows={(insights ?? []).map((r) => ({ ...r, spend: Number(r.spend) }))}
          crmLeads={(crmLeads ?? []).map((l) => ({
            campaign: l.utm_campaign as string,
            date: l.added_date.slice(0, 10),
            paid: l.stage === "paid",
          }))}
          connection={connection}
          hasClub={!!clubId}
          canManage={canManage}
        />
      )}
    </AppShell>
  );
}
