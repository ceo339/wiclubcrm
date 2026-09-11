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
    .select("*, partners(name), members(name), products(name)")
    .order("paid_date", { ascending: false });

  const canEdit = !!profile.partner_id;
  const stripeEnabled =
    canEdit && !!profile.partner_id && profile.partner_id === process.env.STRIPE_ENABLED_PARTNER_ID;
  const { data: members } = canEdit
    ? await supabase
        .from("members")
        .select("id, name, product_id, products(name, price)")
        .order("name")
    : { data: [] };

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  const memberOptions: MemberOption[] = (members ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    product_id: m.product_id,
    product_name: (m as { products?: { name: string } | null }).products?.name ?? null,
    product_price: (m as { products?: { price: number } | null }).products?.price ?? null,
  }));

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
          }))}
          memberOptions={memberOptions}
          canEdit={canEdit}
          stripeEnabled={stripeEnabled}
        />
      )}
    </AppShell>
  );
}
