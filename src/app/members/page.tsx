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
import MembersBoard from "@/components/members/MembersBoard";
import AppShell from "@/components/shell/AppShell";
import type { Tables } from "@/types/database";

export default async function MembersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  // A member can hold several course enrollments now, so they come in as a
  // nested array rather than flat columns on the member row itself.
  const { data: members, error } = await supabase
    .from("members")
    .select("*, partners(name), member_enrollments(*, products(name, price, sessions))")
    .order("created_at", { ascending: false });

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
      title={<T k="navMembers" />}
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
            };
            return {
              ...m,
              partner_name: raw.partners?.name ?? null,
              enrollments: (raw.member_enrollments ?? []).map((e) => ({
                ...e,
                product_name: e.products?.name ?? null,
                product_price: e.products?.price ?? null,
                product_sessions: e.products?.sessions ?? null,
              })),
            };
          })}
          products={products ?? []}
          cohorts={cohorts ?? []}
          isHq={profile.role === "hq"}
          canEdit={canEdit}
        />
      )}
    </AppShell>
  );
}
