import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId } from "@/lib/viewScope";
import type { CohortContactInput, CohortPaymentInput } from "@/lib/cohorts";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import CohortsBoard from "@/components/cohorts/CohortsBoard";

/**
 * "Когортный анализ" (round 27, 16 сен 2026) — cohort-by-first-touch-campaign
 * report. Same RLS-scoping pattern as /attendance: every query below is
 * already scoped to the caller's own club by RLS, the `.eq` only narrows
 * further when an hq/viewer account has picked one specific city in the
 * header switcher (round 18).
 *
 * Round 28 (16 сен 2026) — Anastasiia asked for source/campaign filters and
 * a period picker on this page, both of which need to work against the raw
 * per-contact first-touch fields (a source filter and a campaign filter are
 * independent facets on the same contact, not two views of one already-
 * collapsed cohort label) — so this page hands the raw contacts/payments
 * arrays to the client board, which computes the actual cohort report
 * itself via computeCohortReport once filters are applied, instead of the
 * server computing one fixed, unfiltered report up front.
 */
export default async function CohortsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);

  let contactsQuery = supabase
    .from("contacts")
    .select("id, created_at, first_source, first_utm_campaign");
  let paymentsQuery = supabase.from("payments").select("member_id, lead_id, amount, paid_date, status");
  // added_date/created_at pulled in (round 28) so a contact's cohort month
  // can fall back to its earliest lead/membership instead of only
  // contacts.created_at — see cohortContacts below.
  let membersQuery = supabase.from("members").select("id, contact_id, created_at");
  let leadsQuery = supabase.from("leads").select("id, contact_id, added_date");
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

  // Round 28 — "Почему не взят первый месяц август? там же были оплаты?".
  // `contacts.created_at` is only a true first-touch date for contacts
  // created by findOrCreateContact from a real, live interaction (true since
  // round 4B, 11 сен 2026). Everyone migrated INTO `contacts` by that same
  // round's one-off backfill got `created_at` stamped at migration time, not
  // at their real original lead date — so a lead from August can end up
  // attached to a contact whose own created_at reads as September, silently
  // pushing the whole cohort (and its August revenue) out of the earliest
  // column. Falling back to the earliest linked lead's/member's own date
  // fixes this without touching the stored contacts.created_at (which other
  // parts of the app may rely on as "when this Контакт row was inserted").
  const earliestLeadDateByContact = new Map<string, string>();
  for (const l of leads ?? []) {
    if (!l.contact_id || !l.added_date) continue;
    const current = earliestLeadDateByContact.get(l.contact_id);
    if (!current || l.added_date < current) earliestLeadDateByContact.set(l.contact_id, l.added_date);
  }
  const earliestMemberDateByContact = new Map<string, string>();
  for (const m of members ?? []) {
    if (!m.contact_id || !m.created_at) continue;
    const current = earliestMemberDateByContact.get(m.contact_id);
    if (!current || m.created_at < current) earliestMemberDateByContact.set(m.contact_id, m.created_at);
  }

  const cohortContacts: CohortContactInput[] = (contacts ?? []).map((c) => {
    const candidates = [c.created_at, earliestLeadDateByContact.get(c.id), earliestMemberDateByContact.get(c.id)].filter(
      (d): d is string => !!d
    );
    return {
      id: c.id,
      createdAt: candidates.sort()[0] ?? c.created_at,
      firstSource: c.first_source,
      firstUtmCampaign: c.first_utm_campaign,
    };
  });

  const cohortPayments: CohortPaymentInput[] = (payments ?? [])
    .filter((p) => p.status === "paid")
    .map((p) => ({
      contactId: (p.member_id ? memberContactMap.get(p.member_id) : null) ?? (p.lead_id ? leadContactMap.get(p.lead_id) : null) ?? null,
      amount: p.amount,
      paidDate: p.paid_date,
    }));

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
        <CohortsBoard contacts={cohortContacts} payments={cohortPayments} />
      )}
    </AppShell>
  );
}
