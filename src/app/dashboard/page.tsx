import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/leads";
import { ROYALTY_PERCENT } from "@/lib/royalty";
import {
  currentMonthKey,
  isValidDateStr,
  isValidMonthKey,
  monthKeyOf,
  pctChange,
  shiftMonthKey,
} from "@/lib/dashboard";
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import type { ClubRow, Period } from "@/components/dashboard/DashboardBoard";

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
  const [{ data: partners }, { data: leads }, { data: members }, { data: payments }] =
    await Promise.all([
      supabase.from("partners").select("id, name").order("name"),
      supabase.from("leads").select("partner_id, stage, added_date"),
      supabase.from("members").select("partner_id, created_at"),
      supabase.from("payments").select("partner_id, amount, status, paid_date"),
    ]);

  const allLeads = leads ?? [];
  const allMembers = members ?? [];
  const allPayments = payments ?? [];
  const paidPayments = allPayments.filter((p) => p.status === "paid");

  // Quick-select months: every month with real activity, plus the current
  // one even if it's still empty. Never a fabricated "last 12 months" list —
  // only months that actually have (or could have) something to show.
  const monthsWithData = new Set<string>([currentMonthKey()]);
  allLeads.forEach((l) => monthsWithData.add(monthKeyOf(l.added_date)));
  allMembers.forEach((m) => monthsWithData.add(monthKeyOf(m.created_at)));
  allPayments.forEach((p) => monthsWithData.add(monthKeyOf(p.paid_date)));
  const monthOptions = [...monthsWithData].sort().reverse().slice(0, 6);

  // A custom "from/to" range wins over a month pick when both dates are
  // present and valid; otherwise we're in month mode (selected or current).
  const rangeFrom = params.from && isValidDateStr(params.from) ? params.from : null;
  const rangeTo = params.to && isValidDateStr(params.to) ? params.to : null;
  const isRange = !!(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const selectedMonth =
    !isRange && params.month && isValidMonthKey(params.month) ? params.month : currentMonthKey();

  const period: Period = isRange
    ? { mode: "range", from: rangeFrom!, to: rangeTo! }
    : { mode: "month", month: selectedMonth };

  const inPeriod = (dateStr: string): boolean =>
    period.mode === "range"
      ? dateStr.slice(0, 10) >= period.from && dateStr.slice(0, 10) <= period.to
      : monthKeyOf(dateStr) === period.month;

  // A "previous period" for comparison only makes sense in month mode — for
  // an arbitrary custom range there's no unambiguous "period before it", so
  // we don't invent one.
  const previousMonth = period.mode === "month" ? shiftMonthKey(period.month, -1) : null;
  const inPreviousMonth = (dateStr: string): boolean =>
    previousMonth !== null && monthKeyOf(dateStr) === previousMonth;

  const revenueInPeriod = paidPayments
    .filter((p) => inPeriod(p.paid_date))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const revenuePrevious = paidPayments
    .filter((p) => inPreviousMonth(p.paid_date))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const membersAddedInPeriod = allMembers.filter((m) => inPeriod(m.created_at)).length;

  const leadsInPeriod = allLeads.filter((l) => inPeriod(l.added_date));
  const leadsPrevious = allLeads.filter((l) => inPreviousMonth(l.added_date));
  const conversionRate = (rows: typeof allLeads): number | null =>
    rows.length === 0
      ? null
      : Math.round((100 * rows.filter((l) => l.stage === "paid").length) / rows.length);
  const conversionInPeriod = conversionRate(leadsInPeriod);
  const conversionPrevious = period.mode === "month" ? conversionRate(leadsPrevious) : null;

  const royaltyInPeriod = Math.round((revenueInPeriod * ROYALTY_PERCENT) / 100);

  // Per-club breakdown and the lead funnel reflect the selected period —
  // that's the whole point of picking one. The all-time totals row below
  // stays all-time regardless, as a fixed anchor.
  const clubs: ClubRow[] = (partners ?? []).map((p) => {
    const clubLeads = allLeads.filter((l) => l.partner_id === p.id && inPeriod(l.added_date));
    const clubMembers = allMembers.filter((m) => m.partner_id === p.id && inPeriod(m.created_at));
    const clubPayments = allPayments.filter(
      (pay) => pay.partner_id === p.id && inPeriod(pay.paid_date)
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

  const stageCounts = STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    count: leadsInPeriod.filter((l) => l.stage === s.id).length,
  }));

  const totals = {
    leads: allLeads.length,
    members: allMembers.length,
    collected: paidPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    pending: allPayments
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
        <DashboardBoard
          totals={totals}
          stageCounts={stageCounts}
          clubs={clubs}
          period={period}
          monthOptions={monthOptions}
          revenue={{
            amount: revenueInPeriod,
            delta: period.mode === "month" ? pctChange(revenueInPeriod, revenuePrevious) : null,
          }}
          membersAdded={membersAddedInPeriod}
          conversion={{ value: conversionInPeriod, previous: conversionPrevious }}
          royalty={{ amount: royaltyInPeriod, percent: ROYALTY_PERCENT }}
        />
      </main>
    </div>
  );
}
