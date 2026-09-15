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
import ProductsBoard from "@/components/products/ProductsBoard";
import AppShell from "@/components/shell/AppShell";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);

  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq/viewer) — the .eq below only narrows further, when an hq/viewer
  // account has picked one specific city in the header switcher (Round 18).
  let productsQuery = supabase.from("products").select("*, partners(name)").order("name");
  if (scopePartnerId) productsQuery = productsQuery.eq("partner_id", scopePartnerId);
  const { data: products, error } = await productsQuery;

  let cohortsQuery = supabase.from("product_cohorts").select("*").order("start_date");
  if (scopePartnerId) cohortsQuery = cohortsQuery.eq("partner_id", scopePartnerId);
  const { data: cohorts } = await cohortsQuery;

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  // Real, disclosed counts for each card — how many leads are interested in
  // this product overall, and (per start date) how many members actually
  // enrolled in that cohort. Both scoped by the same RLS as everything else
  // on this page, so HQ still sees network-wide numbers (narrowed further
  // by the same city filter when one is picked).
  let leadsForCountQuery = supabase.from("leads").select("product_id");
  let enrollmentsForCountQuery = supabase.from("member_enrollments").select("product_id, start_date");
  if (scopePartnerId) {
    leadsForCountQuery = leadsForCountQuery.eq("partner_id", scopePartnerId);
    enrollmentsForCountQuery = enrollmentsForCountQuery.eq("partner_id", scopePartnerId);
  }
  const [{ data: leadsForCount }, { data: enrollmentsForCount }] = await Promise.all([
    leadsForCountQuery,
    enrollmentsForCountQuery,
  ]);

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  return (
    <AppShell
      profile={profile}
      title={<T k="navCourses" />}
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
          <T k="errLoadCoursesFailed" />: {error.message}
        </p>
      ) : (
        <ProductsBoard
          initialProducts={(products ?? []).map((p) => ({
            ...p,
            partner_name: (p as { partners?: { name: string } | null }).partners?.name ?? null,
          }))}
          initialCohorts={cohorts ?? []}
          leadsCountByProduct={countBy(leadsForCount ?? [], (l) => l.product_id)}
          membersCountByCohort={countBy(
            enrollmentsForCount ?? [],
            (e) => (e.product_id && e.start_date ? `${e.product_id}|${e.start_date}` : null)
          )}
          isHq={networkView && !scopePartnerId}
          canEdit={!!profile.partner_id}
        />
      )}
    </AppShell>
  );
}

/** Groups `rows` by whatever key `keyOf` returns (skipping null keys) and
 * counts them — the plain tally behind both of this page's real counts. */
function countBy<T>(rows: T[], keyOf: (row: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
