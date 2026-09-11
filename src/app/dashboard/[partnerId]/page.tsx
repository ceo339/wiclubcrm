import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeCoreMetrics,
  countByProduct,
  enrollmentAttributionDate,
  inPeriod,
  monthlyConversion,
  monthlyMemberTotal,
  monthlyRevenue,
  monthsWithActivity,
  parsePeriodParams,
  paymentAttributionDate,
  yearsWithActivity,
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
  searchParams: Promise<{ month?: string; year?: string; from?: string; to?: string }>;
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

  const [{ data: leads }, { data: members }, { data: enrollments }, { data: payments }, { data: products }] =
    await Promise.all([
      supabase.from("leads").select("stage, source, added_date, cohort_start_date").eq("partner_id", partnerId),
      supabase.from("members").select("created_at").eq("partner_id", partnerId),
      supabase.from("member_enrollments").select("product_id, created_at, start_date").eq("partner_id", partnerId),
      supabase
        .from("payments")
        .select("amount, status, paid_date, member_enrollments(start_date, created_at), leads(cohort_start_date, added_date)")
        .eq("partner_id", partnerId),
      supabase.from("products").select("id, name").eq("partner_id", partnerId),
    ]);

  const clubLeads = leads ?? [];
  const clubMembers = members ?? [];
  const clubEnrollments = enrollments ?? [];
  // See src/app/page.tsx's own club branch — same start-date attribution
  // for revenue (Anastasiia, 11 сен 2026).
  const clubPayments = (payments ?? []).map((p) => ({
    ...p,
    enrollment: (p as { member_enrollments?: { start_date: string | null; created_at: string } | null })
      .member_enrollments ?? null,
    lead: (p as { leads?: { cohort_start_date: string | null; added_date: string } | null }).leads ?? null,
  }));
  const productNamesById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const period = parsePeriodParams(searchParamsResolved);
  const monthOptions = monthsWithActivity(clubLeads, clubEnrollments, clubPayments);
  const yearOptions = yearsWithActivity(clubLeads, clubEnrollments, clubPayments);
  const metrics = computeCoreMetrics({
    leads: clubLeads,
    enrollments: clubEnrollments,
    payments: clubPayments,
    period,
  });

  const enrollmentsInPeriod = clubEnrollments.filter((e) => inPeriod(period, enrollmentAttributionDate(e)));

  // See src/app/page.tsx — same fix, "В июле был 1 активный курс, почему на
  // главной пишется, что 2?" (Anastasiia, 11 сен 2026): count distinct
  // courses with real activity in the period, not every course ever added.
  const activeCoursesCount = new Set(
    enrollmentsInPeriod.map((e) => e.product_id).filter((id): id is string => !!id)
  ).size;

  // See src/app/page.tsx — period-scoped like everything else on the page.
  const totals = {
    leads: clubLeads.filter((l) => inPeriod(period, l.added_date)).length,
    members: clubMembers.length,
    collected: clubPayments
      .filter((p) => p.status === "paid" && inPeriod(period, paymentAttributionDate(p)))
      .reduce((sum, p) => sum + Number(p.amount), 0),
    pending: clubPayments
      .filter((p) => p.status === "pending" && inPeriod(period, paymentAttributionDate(p)))
      .reduce((sum, p) => sum + Number(p.amount), 0),
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
        fourthTile={{ labelKey: "statCourses", value: String(activeCoursesCount), deltaKey: "deltaActiveCourses" }}
        funnel={metrics.funnel}
        declinedCount={metrics.declinedCount}
        sourceConversion={metrics.sourceConversion}
        period={period}
        monthOptions={monthOptions}
        yearOptions={yearOptions}
        basePath={`/dashboard/${partnerId}`}
        revenue={metrics.revenue}
        revenueTrend={monthlyRevenue(clubPayments)}
        memberTrend={monthlyMemberTotal(clubEnrollments)}
        conversionTrend={monthlyConversion(clubLeads)}
        membersAdded={metrics.membersAdded}
        conversion={metrics.conversion}
        royalty={metrics.royalty}
        productsPeriod={countByProduct(enrollmentsInPeriod, productNamesById)}
        productsAllTime={countByProduct(clubEnrollments, productNamesById)}
      />
    </AppShell>
  );
}
