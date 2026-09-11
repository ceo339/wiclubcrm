import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
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
  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq) — no manual filtering needed here. members(id) is the reverse
  // side of members.lead_id — lets the lead card know whether it's already
  // linked to a member (see the Lead type's member_id).
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*, partners(name), members(id)")
    .order("added_date", { ascending: false });

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
            };
          })}
          isHq={profile.role === "hq"}
          canEdit={canEdit}
          products={products ?? []}
          cohorts={cohorts ?? []}
          partnerCountry={profile.partner_country}
        />
      )}
    </AppShell>
  );
}
