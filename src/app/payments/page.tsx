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
import PaymentsBoard from "@/components/payments/PaymentsBoard";
import type { MemberOption } from "@/components/payments/types";
import AppShell from "@/components/shell/AppShell";

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*, partners(name), members(name), products(name), leads(name)")
    .order("paid_date", { ascending: false });

  const canEdit = !!profile.partner_id;
  const stripeEnabled =
    canEdit && !!profile.partner_id && profile.partner_id === process.env.STRIPE_ENABLED_PARTNER_ID;
  // A member can hold several course enrollments now, so the picker offers
  // one row per enrollment (each with its own default price) instead of
  // one row per member.
  const { data: members } = canEdit
    ? await supabase
        .from("members")
        .select("id, name, member_enrollments(id, price, products(name))")
        .order("name")
    : { data: [] };

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  const memberOptions: MemberOption[] = (members ?? []).flatMap((m): MemberOption[] => {
    const enrollments =
      (m as { member_enrollments?: { id: string; price: number; products: { name: string } | null }[] })
        .member_enrollments ?? [];
    if (enrollments.length === 0) {
      return [{ key: `member:${m.id}`, memberId: m.id, enrollmentId: null, label: m.name, defaultAmount: null }];
    }
    return enrollments.map(
      (e): MemberOption => ({
        key: e.id,
        memberId: m.id,
        enrollmentId: e.id,
        label: e.products?.name ? `${m.name} — ${e.products.name}` : m.name,
        defaultAmount: e.price,
      })
    );
  });

  return (
    <AppShell
      profile={profile}
      title={<T k="navPayments" />}
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
          }))}
          memberOptions={memberOptions}
          canEdit={canEdit}
          stripeEnabled={stripeEnabled}
        />
      )}
    </AppShell>
  );
}
