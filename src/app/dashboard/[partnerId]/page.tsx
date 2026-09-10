import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeCoreMetrics,
  countByProduct,
  inPeriod,
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

  // HQ can open any club's own dashboard (read-only, same as everywhere
  // else). A partner/staff account can only ever land on its own club —
  // RLS would return empty rows for someone else's anyway, but redirecting
  // is more honest than showing a blank dashboard for the wrong URL.
  if (profile.role !== "hq") {
    if (!profile.partner_id) redirect("/");
    if (profile.partner_id !== partnerId) redirect(`/dashboard/${profile.partner_id}`);
  }

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
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link
            href={profile.role === "hq" ? "/dashboard" : "/"}
            className="text-sm text-muted hover:text-ink-2"
          >
            ← <T k={profile.role === "hq" ? "headingNetworkSummary" : "appName"} />
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {partner.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope scope={`club:${partnerId}`} fallback={currencyForCountry(partner.country)} />
          <CurrencySwitcher />
          <LocaleScope scope={`club:${partnerId}`} fallback={localeForCountry(partner.country)} />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
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
          membersAdded={metrics.membersAdded}
          conversion={metrics.conversion}
          royalty={metrics.royalty}
          productsPeriod={countByProduct(membersInPeriod, productNamesById)}
          productsAllTime={countByProduct(clubMembers, productNamesById)}
        />
      </main>
    </div>
  );
}
