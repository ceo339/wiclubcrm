import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeCoreMetrics,
  countByProduct,
  inPeriod,
  monthlyConversion,
  monthlyMemberTotal,
  monthlyRevenue,
  monthsWithActivity,
  parsePeriodParams,
} from "@/lib/dashboard";
import { currencyForCountry } from "@/lib/currency";
import { localeForCountry } from "@/lib/i18n";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";

export default async function ClubDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { partnerId } = await params;

  // This route is now an HQ-only drill-down into one specific OTHER club
  // (reached by clicking a club row on Главная) — a partner/staff account's
  // own club dashboard lives on Главная itself since the merge, so there's
  // nothing left for a non-HQ visitor to see here, own club or not.
  if (profile.role !== "hq") redirect("/");

  const searchParamsResolved = await searchParams;
  const supabase = await createClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, country")
    .eq("id", partnerId)
    .single();
  if (!partner) notFound();

  const [{ data: leads }, { data: members }, { data: payments }, { data: products }] = await Promise.all([
    supabase.from("leads").select("stage, source, added_date").eq("partner_id", partnerId),
    supabase.from("members").select("created_at, product_id").eq("partner_id", partnerId),
    supabase.from("payments").select("amount, status, paid_date").eq("partner_id", partnerId),
    supabase.from("products").select("id, name").eq("partner_id", partnerId),
  ]);

  const clubLeads = leads ?? [];
  const clubMembers = members ?? [];
  const clubPayments = payments ?? [];
  const productNamesById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const period = parsePeriodParams(searchParamsResolved);
  const monthOptions = monthsWithActivity(clubLeads, clubMembers, clubPayments);
  const metrics = computeCoreMetrics({
    leads: clubLeads,
    members: clubMembers,
    payments: clubPayments,
    period,
  });

  const membersInPeriod = clubMembers.filter((m) => inPeriod(period, m.created_at));

  const totals = {
    leads: clubLeads.length,
    members: clubMembers.length,
    collected: clubPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0),
    pending: clubPayments.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0),
  };

  return (
    <AppShell
      profile={profile}
      title={partner.name}
      backHref="/"
      backLabel={<T k="headingHome" />}
      headerExtra={
        <>
          <CurrencyScope scope={`club:${partnerId}`} fallback={currencyForCountry(partner.country)} />
          <CurrencySwitcher />
          <LocaleScope scope={`club:${partnerId}`} fallback={localeForCountry(partner.country)} />
          <LocaleSwitcher />
        </>
      }
    >
      <DashboardBoard
        totals={totals}
        fourthTile={{ labelKey: "statCourses", value: String((products ?? []).length), deltaKey: "deltaActiveCourses" }}
        funnel={metrics.funnel}
        declinedCount={metrics.declinedCount}
        sourceConversion={metrics.sourceConversion}
        period={period}
        monthOptions={monthOptions}
        basePath={`/dashboard/${partnerId}`}
        revenue={metrics.revenue}
        revenueTrend={monthlyRevenue(clubPayments)}
        memberTrend={monthlyMemberTotal(clubMembers)}
        conversionTrend={monthlyConversion(clubLeads)}
        membersAdded={metrics.membersAdded}
        conversion={metrics.conversion}
        royalty={metrics.royalty}
        productsPeriod={countByProduct(membersInPeriod, productNamesById)}
        productsAllTime={countByProduct(clubMembers, productNamesById)}
      />
    </AppShell>
  );
}
