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
import ProductsBoard from "@/components/products/ProductsBoard";
import AppShell from "@/components/shell/AppShell";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  const { data: products, error } = await supabase
    .from("products")
    .select("*, partners(name)")
    .order("name");

  const { data: cohorts } = await supabase
    .from("product_cohorts")
    .select("*")
    .order("start_date");

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  return (
    <AppShell
      profile={profile}
      title={<T k="navCourses" />}
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
          <T k="errLoadCoursesFailed" />: {error.message}
        </p>
      ) : (
        <ProductsBoard
          initialProducts={(products ?? []).map((p) => ({
            ...p,
            partner_name: (p as { partners?: { name: string } | null }).partners?.name ?? null,
          }))}
          initialCohorts={cohorts ?? []}
          isHq={profile.role === "hq"}
          canEdit={!!profile.partner_id}
        />
      )}
    </AppShell>
  );
}
