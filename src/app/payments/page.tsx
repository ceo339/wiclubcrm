import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId, getViewMode } from "@/lib/viewScope";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import PaymentsBoard from "@/components/payments/PaymentsBoard";
import type { MemberOption } from "@/components/payments/types";
import AppShell from "@/components/shell/AppShell";
import { getPackageSalesForPayments } from "@/app/packages/actions";

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);
  const viewMode = await getViewMode(profile);

  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq/viewer) — the .eq below only narrows further, when an hq/viewer
  // account has picked one specific city in the header switcher (Round 18).
  let paymentsQuery = supabase
    .from("payments")
    .select(
      "*, partners(name), members(name), products(name), leads(name, cohort_start_date, added_date), member_enrollments(start_date, created_at)"
    )
    .order("paid_date", { ascending: false });
  if (scopePartnerId) paymentsQuery = paymentsQuery.eq("partner_id", scopePartnerId);
  const [{ data: payments, error }, packageSales] = await Promise.all([
    paymentsQuery,
    getPackageSalesForPayments(scopePartnerId),
  ]);

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  const canEdit = !!profile.partner_id;
  const stripeEnabled =
    canEdit && !!profile.partner_id && profile.partner_id === process.env.STRIPE_ENABLED_PARTNER_ID;
  // A member can hold several course enrollments now, so the picker offers
  // one row per enrollment (each with its own default price) instead of
  // one row per member.
  const { data: members } = canEdit
    ? await supabase
        .from("members")
        .select("id, name, member_enrollments(id, price, start_date, status, products(name), payments(amount, status))")
        .order("name")
    : { data: [] };
  const [{ data: products }, { data: cohorts }] = canEdit
    ? await Promise.all([
        supabase.from("products").select("id, name, price").order("name"),
        supabase.from("product_cohorts").select("product_id, start_date").order("start_date"),
      ])
    : [{ data: [] }, { data: [] }];

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  // Round 53: one row per поток (course + start date), plus one bare row per
  // member so a payment for a NEW поток can be started from her name.
  type EnrollmentRow = {
    id: string;
    price: number;
    start_date: string | null;
    status: string;
    products: { name: string } | null;
    payments: { amount: number; status: string }[] | null;
  };
  const fmt = (d: string | null) => (d ? d.split("-").reverse().join(".") : null);
  const memberOptions: MemberOption[] = (members ?? []).flatMap((m): MemberOption[] => {
    const enrollments = ((m as { member_enrollments?: EnrollmentRow[] }).member_enrollments ?? []).filter(
      (e) => e.status !== "sNoShow"
    );
    const rows = enrollments.map((e): MemberOption => {
      const paid = (e.payments ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
      const left = Number(e.price) - paid;
      const remaining = left > 0.01 ? left : 0;
      const parts = [e.products?.name, fmt(e.start_date) ? `поток ${fmt(e.start_date)}` : null].filter(Boolean);
      return {
        key: e.id,
        memberId: m.id,
        enrollmentId: e.id,
        label: parts.length ? `${m.name} — ${parts.join(" · ")}` : m.name,
        defaultAmount: remaining > 0 ? remaining : e.price,
        remaining,
      };
    });
    return [...rows, { key: `member:${m.id}`, memberId: m.id, enrollmentId: null, label: m.name, defaultAmount: null }];
  });

  return (
    <AppShell
      profile={profile}
      title={<T k="navPayments" />}
      clubs={clubs ?? []}
      activeClubId={scopePartnerId}
      viewMode={viewMode}
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
          <T k="errLoadPaymentsFailed" />: {error.message}
        </p>
      ) : (
        <PaymentsBoard
          initialPayments={(payments ?? []).map((p) => ({
            ...p,
            partner_name: (p as { partners?: { name: string } | null }).partners?.name ?? null,
            member_name: (p as { members?: { name: string } | null }).members?.name ?? null,
            product_name: (p as { products?: { name: string } | null }).products?.name ?? null,
            // Set when this payment came from a lead reaching "Оплата"
            // before she's been converted to a member yet — see
            // updateLeadStage in app/leads/actions.
            lead_name: (p as { leads?: { name: string } | null }).leads?.name ?? null,
            // Course-start attribution — see paymentAttributionDate in
            // lib/dashboard (same pattern as src/app/page.tsx).
            enrollment: (p as { member_enrollments?: { start_date: string | null; created_at: string } | null })
              .member_enrollments ?? null,
            lead: (p as { leads?: { cohort_start_date: string | null; added_date: string } | null }).leads ?? null,
          }))}
          memberOptions={memberOptions}
          products={products ?? []}
          cohorts={cohorts ?? []}
          canEdit={canEdit}
          stripeEnabled={stripeEnabled}
          packageSales={packageSales}
        />
      )}
    </AppShell>
  );
}
