import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import PartnersBoard from "@/components/partners/PartnersBoard";
import AppShell from "@/components/shell/AppShell";

export default async function PartnersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hq") redirect("/");

  const supabase = await createClient();
  const { data: partners, error } = await supabase
    .from("partners")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title={<T k="navPartners" />}
      headerExtra={
        <>
          <CurrencyScope scope="network" fallback="USD" />
          <CurrencySwitcher />
          <LocaleScope scope="network" fallback="ru" />
          <LocaleSwitcher />
        </>
      }
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          <T k="errLoadClubsFailed" />: {error.message}
        </p>
      ) : (
        <PartnersBoard initialPartners={partners ?? []} />
      )}
    </AppShell>
  );
}
