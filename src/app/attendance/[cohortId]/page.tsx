import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency";
import { localeForCountry } from "@/lib/i18n";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import GroupAttendanceBoard from "@/components/attendance/GroupAttendanceBoard";
import AppShell from "@/components/shell/AppShell";

export default async function CohortAttendancePage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { cohortId } = await params;
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("product_cohorts")
    .select("id, partner_id, product_id, start_date, products(name, sessions), partners(name, country)")
    .eq("id", cohortId)
    .single();
  if (!cohort) notFound();

  // A partner/staff account can only ever open its own club's stream — RLS
  // would return no members for someone else's anyway, but redirecting is
  // more honest than showing an empty grid for the wrong URL.
  if (profile.role !== "hq" && profile.partner_id !== cohort.partner_id) {
    redirect("/attendance");
  }

  const product = (cohort as { products?: { name: string; sessions: number | null } | null }).products;
  const partner = (cohort as { partners?: { name: string; country: string | null } | null }).partners;

  const { data: members } = await supabase
    .from("members")
    .select("id, name, attended")
    .eq("partner_id", cohort.partner_id)
    .eq("product_id", cohort.product_id)
    .eq("start_date", cohort.start_date)
    .order("name");

  const canEdit = !!profile.partner_id;

  return (
    <AppShell
      profile={profile}
      title={product?.name ?? <T k="courseDeleted" />}
      subtitle={
        <>
          {profile.role === "hq" && partner?.name ? `${partner.name} · ` : ""}
          <T k="startsOn" vars={{ date: cohort.start_date }} />
        </>
      }
      backHref="/attendance"
      backLabel={<T k="navAttendance" />}
      headerExtra={
        <>
          <CurrencyScope
            scope={`club:${cohort.partner_id}`}
            fallback={currencyForCountry(partner?.country)}
          />
          <CurrencySwitcher />
          <LocaleScope
            scope={`club:${cohort.partner_id}`}
            fallback={localeForCountry(partner?.country)}
          />
          <LocaleSwitcher />
        </>
      }
    >
      <div className="rounded-xl border border-border bg-background shadow-card">
        <GroupAttendanceBoard
          members={members ?? []}
          sessions={product?.sessions ?? 0}
          canEdit={canEdit}
        />
      </div>
    </AppShell>
  );
}
