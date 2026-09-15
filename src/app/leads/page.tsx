import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId } from "@/lib/viewScope";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import LeadsBoard from "@/components/leads/LeadsBoard";
import AppShell from "@/components/shell/AppShell";

export default async function LeadsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);

  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq/viewer) — the .eq below only narrows further, when an hq/viewer
  // account has picked one specific city in the header switcher (Round 18).
  // members(id) is the reverse side of members.lead_id — lets the lead
  // card know whether it's already linked to a member (see Lead.member_id).
  let leadsQuery = supabase
    .from("leads")
    .select("*, partners(name), members(id)")
    .order("added_date", { ascending: false });
  if (scopePartnerId) leadsQuery = leadsQuery.eq("partner_id", scopePartnerId);
  const { data: leads, error } = await leadsQuery;

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  // "добавить под источником комментарии (если они есть)" (Anastasiia, 14
  // сен 2026) — комментарии live in their own table (entity_type/entity_id,
  // see getLeadDetail), not joined onto leads normally since a card only
  // needs them once opened. The board itself needs just the *latest* one
  // per lead so a partner can tell at a glance which cards already have a
  // note without opening each one — one extra query for every lead id on
  // this page, kept newest-first so the first row seen per id wins below.
  const leadIds = (leads ?? []).map((l) => l.id);
  const { data: latestComments } = leadIds.length
    ? await supabase
        .from("comments")
        .select("entity_id, text, created_at")
        .eq("entity_type", "lead")
        .in("entity_id", leadIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latestCommentByLead = new Map<string, string>();
  for (const c of latestComments ?? []) {
    if (!latestCommentByLead.has(c.entity_id)) latestCommentByLead.set(c.entity_id, c.text);
  }

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  const canEdit = !!profile.partner_id;
  const [{ data: products }, { data: cohorts }] = canEdit
    ? await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("product_cohorts").select("*").order("start_date"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <AppShell
      profile={profile}
      title={<T k="navLeads" />}
      clubs={clubs ?? []}
      activeClubId={scopePartnerId}
      headerExtra={
        <>
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          <T k="errLoadLeadsFailed" />: {error.message}
        </p>
      ) : (
        <LeadsBoard
          initialLeads={(leads ?? []).map((l) => {
            const raw = l as unknown as {
              partners?: { name: string } | null;
              members?: { id: string } | { id: string }[] | null;
            };
            const memberRow = Array.isArray(raw.members) ? raw.members[0] : raw.members;
            return {
              ...l,
              partner_name: raw.partners?.name ?? null,
              member_id: memberRow?.id ?? null,
              latest_comment: latestCommentByLead.get(l.id) ?? null,
            };
          })}
          isHq={profile.role === "hq"}
          isNetworkView={networkView && !scopePartnerId}
          canEdit={canEdit}
          products={products ?? []}
          cohorts={cohorts ?? []}
          partnerCountry={profile.partner_country}
        />
      )}
    </AppShell>
  );
}
