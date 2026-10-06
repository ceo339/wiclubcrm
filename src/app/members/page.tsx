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
import MembersBoard from "@/components/members/MembersBoard";
import AppShell from "@/components/shell/AppShell";
import type { Tables } from "@/types/database";
import { enrollmentNeedsCohort } from "@/lib/members";
import { autoCompleteDueEnrollments } from "./actions";

export default async function MembersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Catch up any "sPaid" enrollment that's become due for "sCompleted"
  // (see enrollmentIsDueForCompletion) before reading the list, so a
  // finished МК or fully-attended course shows the right status without
  // Anastasiia having to open each card by hand.
  await autoCompleteDueEnrollments();

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);
  const viewMode = await getViewMode(profile);

  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq/viewer) — the .eq below only narrows further, when an hq/viewer
  // account has picked one specific city in the header switcher (Round 18).
  // A member can hold several course enrollments now, so they come in as a
  // nested array rather than flat columns on the member row itself.
  let membersQuery = supabase
    .from("members")
    .select(
      "*, partners(name), member_enrollments(*, products(name, price, sessions)), package_sales(id, label, package_sale_items(enrollment_id))"
    )
    .order("created_at", { ascending: false });
  if (scopePartnerId) membersQuery = membersQuery.eq("partner_id", scopePartnerId);
  const { data: members, error } = await membersQuery;

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  // Round 58 — which courses have потоки at all (for the «Выберите поток» mark).
  // Read for every role, HQ included; RLS scopes it exactly like the members above.
  const { data: cohortProductRows } = await supabase.from("product_cohorts").select("product_id");
  const productsWithCohorts = new Set((cohortProductRows ?? []).map((c) => c.product_id));

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
      title={<T k="navMembers" />}
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
          <T k="errLoadMembersFailed" />: {error.message}
        </p>
      ) : (
        <MembersBoard
          initialMembers={(members ?? []).map((m) => {
            const raw = m as unknown as {
              partners?: { name: string } | null;
              member_enrollments?: (Tables<"member_enrollments"> & {
                products?: { name: string; price: number; sessions: number | null } | null;
              })[];
              package_sales?: { id: string; label: string; package_sale_items: { enrollment_id: string | null }[] }[];
            };
            return {
              ...m,
              partner_name: raw.partners?.name ?? null,
              // Round 53 — packages visible right in the list.
              packages: (raw.package_sales ?? []).map((p) => ({
                id: p.id,
                label: p.label,
                total: p.package_sale_items.length,
                assigned: p.package_sale_items.filter((i) => i.enrollment_id).length,
              })),
              enrollments: (raw.member_enrollments ?? []).map((e) => ({
                ...e,
                product_name: e.products?.name ?? null,
                product_price: e.products?.price ?? null,
                product_sessions: e.products?.sessions ?? null,
                needs_cohort: enrollmentNeedsCohort(e, productsWithCohorts),
              })),
            };
          })}
          products={products ?? []}
          cohorts={cohorts ?? []}
          isHq={networkView && !scopePartnerId}
          canEdit={canEdit}
        />
      )}
    </AppShell>
  );
}
