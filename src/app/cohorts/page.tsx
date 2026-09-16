import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId } from "@/lib/viewScope";
import { computeCohortReport, type CohortContactInput, type CohortPaymentInput } from "@/lib/cohorts";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import CohortsBoard from "@/components/cohorts/CohortsBoard";

const HORIZON_MONTHS = 12;

/**
 * "Когорты" (round 27, 16 сен 2026) — cohort-by-first-touch-campaign report.
 * Same RLS-scoping pattern as /attendance: every query below is already
 * scoped to the caller's own club by RLS, the `.eq` only narrows further
 * when an hq/viewer account has picked one specific city in the header
 * switcher (round 18).
 */
export default async function CohortsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);

  let contactsQuery = supabase.from("contacts").select("id, created_at, first_source, first_utm_campaign");
  let paymentsQuery = supabase.from("payments").select("member_id, lead_id, amount, paid_date, status");
  let membersQuery = supabase.from("members").select("id, contact_id");
  let leadsQuery = supabase.from("leads").select("id, contact_id");
  if (scopePartnerId) {
    contactsQuery = contactsQuery.eq("partner_id", scopePartnerId);
    paymentsQuery = paymentsQuery.eq("partner_id", scopePartnerId);
    membersQuery = membersQuery.eq("partner_id", scopePartnerId);
    leadsQuery = leadsQuery.eq("partner_id", scopePartnerId);
  }

  const [{ data: contacts, error }, { data: payments }, { data: members }, { data: leads }] = await Promise.all([
    contactsQuery,
    paymentsQuery,
    membersQuery,
    leadsQuery,
  ]);

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  const memberContactMap = new Map((members ?? []).map((m) => [m.id, m.contact_id]));
  const leadContactMap = new Map((leads ?? []).map((l) => [l.id, l.contact_id]));

  const cohortContacts: CohortContactInput[] = (contacts ?? []).map((c) => ({
    id: c.id,
    createdAt: c.created_at,
    firstSource: c.first_source,
    firstUtmCampaign: c.first_utm_campaign,
  }));

  const cohortPayments: CohortPaymentInput[] = (payments ?? [])
    .filter((p) => p.status === "paid")
    .map((p) => ({
      contactId: (p.member_id ? memberContactMap.get(p.member_id) : null) ?? (p.lead_id ? leadContactMap.get(p.lead_id) : null) ?? null,
      amount: p.amount,
      paidDate: p.paid_date,
    }));

  const report = computeCohortReport(cohortContacts, cohortPayments, HORIZON_MONTHS);

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  return (
    <AppShell
      profile={profile}
      title={<T k="navCohorts" />}
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
          <T k="errLoadCohortsFailed" />: {error.message}
        </p>
      ) : (
        <CohortsBoard report={report} />
      )}
    </AppShell>
  );
}
