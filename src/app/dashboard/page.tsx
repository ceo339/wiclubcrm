import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/leads";
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import type { ClubRow } from "@/components/dashboard/DashboardBoard";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hq") redirect("/");

  const supabase = await createClient();
  // RLS: is_hq() sees every partner's rows here — that's the point of this
  // page. Fetching the raw rows (not pre-aggregated) so the totals below are
  // computed from real data, not a view that could hide something.
  const [{ data: partners }, { data: leads }, { data: members }, { data: payments }] =
    await Promise.all([
      supabase.from("partners").select("id, name").order("name"),
      supabase.from("leads").select("partner_id, stage"),
      supabase.from("members").select("partner_id"),
      supabase.from("payments").select("partner_id, amount, status"),
    ]);

  const clubs: ClubRow[] = (partners ?? []).map((p) => {
    const clubLeads = (leads ?? []).filter((l) => l.partner_id === p.id);
    const clubMembers = (members ?? []).filter((m) => m.partner_id === p.id);
    const clubPayments = (payments ?? []).filter((pay) => pay.partner_id === p.id);
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

  const stageCounts = STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    count: (leads ?? []).filter((l) => l.stage === s.id).length,
  }));

  const totals = {
    leads: (leads ?? []).length,
    members: (members ?? []).length,
    collected: (payments ?? [])
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + Number(p.amount), 0),
    pending: (payments ?? [])
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + Number(p.amount), 0),
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
        <DashboardBoard totals={totals} stageCounts={stageCounts} clubs={clubs} />
      </main>
    </div>
  );
}
