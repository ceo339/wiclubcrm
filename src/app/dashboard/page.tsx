import { redirect } from "next/navigation";
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
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import type { ClubRow } from "@/components/dashboard/DashboardBoard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hq") redirect("/");

  const params = await searchParams;

  const supabase = await createClient();
  // RLS: is_hq() sees every partner's rows here — that's the point of this
  // page. Fetching the raw rows (not pre-aggregated) so both the all-time
  // totals and the period-filtered figures below are computed from real
  // data, not a view that could hide something.
  const [{ data: partners }, { data: leads }, { data: members }, { data: payments }, { data: products }] =
    await Promise.all([
      supabase.from("partners").select("id, name").order("name"),
      supabase.from("leads").select("partner_id, stage, added_date"),
      supabase.from("members").select("partner_id, created_at, product_id"),
      supabase.from("payments").select("partner_id, amount, status, paid_date"),
      supabase.from("products").select("id, name"),
    ]);

  const allLeads = leads ?? [];
  const allMembers = members ?? [];
  const allPayments = payments ?? [];
  const productNamesById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const period = parsePeriodParams(params);
  const monthOptions = monthsWithActivity(allLeads, allMembers, allPayments);
  const metrics = computeCoreMetrics({ leads: allLeads, members: allMembers, payments: allPayments, period });

  const membersInPeriod = allMembers.filter((m) => inPeriod(period, m.created_at));

  // Per-club breakdown and the lead funnel reflect the selected period —
  // that's the whole point of picking one. The all-time totals row below
  // stays all-time regardless, as a fixed anchor.
  const clubs: ClubRow[] = (partners ?? []).map((p) => {
    const clubLeads = allLeads.filter((l) => l.partner_id === p.id && inPeriod(period, l.added_date));
    const clubMembers = allMembers.filter((m) => m.partner_id === p.id && inPeriod(period, m.created_at));
    const clubPayments = allPayments.filter(
      (pay) => pay.partner_id === p.id && inPeriod(period, pay.paid_date)
    );
    return {
      id: p.id,
      name: p.name,
      leadsCount: clubLeads.length,
      membersCount: clubMembers.length,
      collected: clubPayments
        .filter((pay) => pay.status === "paid")
        .reduce((sum, pay) => sum + Number(pay.amount), 0),
      pending: clubPayments
        .filter((pay) => pay.status === "pending")
        .reduce((sum, pay) => sum + Number(pay.amount), 0),
    };
  });

  const totals = {
    leads: allLeads.length,
    members: allMembers.length,
    collected: allPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0),
    pending: allPayments.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0),
  };

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Сводка по сети
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        <DashboardBoard
          totals={totals}
          fourthTile={{ label: "Клубов в сети", value: String(clubs.length), delta: "действующих" }}
          stageCounts={metrics.stageCounts}
          clubs={clubs}
          period={period}
          monthOptions={monthOptions}
          basePath="/dashboard"
          revenue={metrics.revenue}
          membersAdded={metrics.membersAdded}
          conversion={metrics.conversion}
          royalty={metrics.royalty}
          productsPeriod={countByProduct(membersInPeriod, productNamesById)}
          productsAllTime={countByProduct(allMembers, productNamesById)}
        />
      </main>
    </div>
  );
}
