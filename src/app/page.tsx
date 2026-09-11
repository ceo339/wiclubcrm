import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile, currencyForCountry } from "@/lib/currency";
import { localeScopeForProfile, localeForCountry } from "@/lib/i18n";
import { sortOpenTasks, type OpenTask } from "@/lib/tasks";
import {
  computeCoreMetrics,
  countByProduct,
  enrollmentAttributionDate,
  findDecliningClubs,
  paymentAttributionDate,
  findStaleLeads,
  inPeriod,
  monthlyConversion,
  monthlyMemberTotal,
  monthlyRevenue,
  monthsWithActivity,
  parsePeriodParams,
} from "@/lib/dashboard";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import TasksWidget from "@/components/home/TasksWidget";
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import type { ClubRow } from "@/components/dashboard/DashboardBoard";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";

const ROLE_LABEL_KEYS: Record<string, string> = {
  partner: "roleLabelPartner",
  staff: "roleLabelStaff",
  hq: "roleLabelHq",
};

/**
 * Главная = the old "Обзор" tasks widget merged with what used to be a
 * separate "Сводка" tab, per Anastasiia's own framing of the prototype
 * ("Главная и сводка — это одна и та же вкладка"). HQ sees the network-wide
 * dashboard (what used to live at /dashboard); a partner/staff account sees
 * their own club's dashboard (what used to live at /dashboard/[their id]) —
 * same two data-fetching paths as before, just both landing here instead of
 * behind a second tab. /dashboard/[partnerId] still exists, but only as an
 * HQ drill-down into one specific OTHER club (reached by clicking a club
 * row below), not as a place a partner's own dashboard lives anymore.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);
  const roleLabelKey = ROLE_LABEL_KEYS[profile.role];
  const params = await searchParams;
  const supabase = await createClient();

  // "Мои задачи" / "Задачи по сети" — every open (not done) task across a
  // partner's leads and members in one place; HQ gets the same list
  // read-only across every club (RLS decides which rows come back, this
  // just renders them). Tasks have no FK to leads/members (entity_id is
  // generic), so names come from two follow-up lookups rather than a join.
  const { data: rawTasks } = await supabase
    .from("tasks")
    .select("*, partners(name)")
    .eq("done", false);

  const leadIds = (rawTasks ?? []).filter((t) => t.entity_type === "lead").map((t) => t.entity_id);
  const memberIds = (rawTasks ?? []).filter((t) => t.entity_type === "member").map((t) => t.entity_id);
  const [{ data: leadsForTasks }, { data: membersForTasks }] = await Promise.all([
    leadIds.length ? supabase.from("leads").select("id, name").in("id", leadIds) : Promise.resolve({ data: [] }),
    memberIds.length
      ? supabase.from("members").select("id, name").in("id", memberIds)
      : Promise.resolve({ data: [] }),
  ]);
  const leadNameById = new Map((leadsForTasks ?? []).map((l) => [l.id, l.name]));
  const memberNameById = new Map((membersForTasks ?? []).map((m) => [m.id, m.name]));

  const openTasks: OpenTask[] = sortOpenTasks(
    (rawTasks ?? []).map((row) => {
      const entityType = row.entity_type as "lead" | "member";
      const entityName =
        (entityType === "lead" ? leadNameById.get(row.entity_id) : memberNameById.get(row.entity_id)) ??
        "—";
      return {
        id: row.id,
        text: row.text,
        dueDate: row.due_date,
        entityType,
        entityId: row.entity_id,
        entityName,
        partnerName: profile.role === "hq" ? (row.partners?.name ?? null) : null,
      };
    })
  );

  const tasksPanel = (profile.partner_id || profile.role === "hq") && (
    <TasksWidget
      tasks={openTasks}
      headingKey={profile.role === "hq" ? "headingNetworkTasks" : "headingMyTasks"}
      canEdit={!!profile.partner_id}
    />
  );

  // ---------------------------------------------------------------------
  // HQ: network-wide dashboard (same fetch/computation the old standalone
  // /dashboard page did — nothing pre-aggregated, everything computed live
  // from the real leads/members/payments rows so it can't hide anything).
  if (profile.role === "hq") {
    const [{ data: partners }, { data: leads }, { data: members }, { data: enrollments }, { data: payments }, { data: products }] =
      await Promise.all([
        supabase.from("partners").select("id, name").order("name"),
        supabase.from("leads").select("id, name, partner_id, stage, source, added_date, cohort_start_date, updated_at"),
        supabase.from("members").select("partner_id, created_at"),
        supabase.from("member_enrollments").select("partner_id, product_id, created_at, start_date"),
        supabase
          .from("payments")
          .select("partner_id, amount, status, paid_date, member_enrollments(start_date, created_at), leads(cohort_start_date, added_date)"),
        supabase.from("products").select("id, name"),
      ]);

    const allLeads = leads ?? [];
    const allMembers = members ?? [];
    const allEnrollments = enrollments ?? [];
    // "выручка считается по предоставленной услуге (старту курса)"
    // (Anastasiia, 11 сен 2026) — each payment carries its course's start
    // date (via its enrollment, or the originating lead's chosen stream
    // before she's a member yet) so every revenue figure below can be
    // attributed to when the course actually happens, not paid_date.
    const allPayments = (payments ?? []).map((p) => ({
      ...p,
      enrollment: (p as { member_enrollments?: { start_date: string | null; created_at: string } | null })
        .member_enrollments ?? null,
      lead: (p as { leads?: { cohort_start_date: string | null; added_date: string } | null }).leads ?? null,
    }));
    const productNamesById = new Map((products ?? []).map((p) => [p.id, p.name]));
    const partnerNamesById = new Map((partners ?? []).map((p) => [p.id, p.name]));

    const staleLeads = findStaleLeads(allLeads, partnerNamesById);
    const decliningClubs = findDecliningClubs(partners ?? [], allPayments);

    const period = parsePeriodParams(params);
    const monthOptions = monthsWithActivity(allLeads, allEnrollments, allPayments);
    const metrics = computeCoreMetrics({ leads: allLeads, enrollments: allEnrollments, payments: allPayments, period });

    // "Участницы по продуктам" — same start-date attribution as everywhere
    // else on this page (see enrollmentAttributionDate), counting
    // ENROLLMENTS, not members — a member with two courses shows up in
    // both buckets, which is the honest answer to "how many are signed up
    // for this course".
    const enrollmentsInPeriod = allEnrollments.filter((e) => inPeriod(period, enrollmentAttributionDate(e)));

    const clubs: ClubRow[] = (partners ?? []).map((p) => {
      const clubLeads = allLeads.filter((l) => l.partner_id === p.id && inPeriod(period, l.added_date));
      const clubEnrollmentsInPeriod = allEnrollments.filter(
        (e) => e.partner_id === p.id && inPeriod(period, enrollmentAttributionDate(e))
      );
      const clubPayments = allPayments.filter(
        (pay) => pay.partner_id === p.id && inPeriod(period, paymentAttributionDate(pay))
      );
      return {
        id: p.id,
        name: p.name,
        leadsCount: clubLeads.length,
        membersCount: clubEnrollmentsInPeriod.length,
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
      <AppShell
        profile={profile}
        title={<T k="headingHome" />}
        subtitle={
          <>
            {profile.partner_name ?? <T k="noClubAttached" />} · {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
          </>
        }
        headerExtra={
          <>
            <CurrencyScope scope="network" fallback="USD" />
            <CurrencySwitcher />
            <LocaleScope scope="network" fallback="ru" />
            <LocaleSwitcher />
          </>
        }
      >
        <DashboardBoard
          totals={totals}
          fourthTile={{ labelKey: "statClubsInNetwork", value: String(clubs.length), deltaKey: "deltaActiveClubs" }}
          funnel={metrics.funnel}
          declinedCount={metrics.declinedCount}
          sourceConversion={metrics.sourceConversion}
          clubs={clubs}
          staleLeads={staleLeads}
          decliningClubs={decliningClubs}
          tasksPanel={tasksPanel}
          period={period}
          monthOptions={monthOptions}
          basePath="/"
          revenue={metrics.revenue}
          revenueTrend={monthlyRevenue(allPayments)}
          memberTrend={monthlyMemberTotal(allEnrollments)}
          conversionTrend={monthlyConversion(allLeads)}
          membersAdded={metrics.membersAdded}
          conversion={metrics.conversion}
          royalty={metrics.royalty}
          productsPeriod={countByProduct(enrollmentsInPeriod, productNamesById)}
          productsAllTime={countByProduct(allEnrollments, productNamesById)}
        />
      </AppShell>
    );
  }

  // ---------------------------------------------------------------------
  // Partner / staff with no club attached yet — nothing to show a
  // dashboard for, same as before this merge.
  if (!profile.partner_id) {
    return (
      <AppShell
        profile={profile}
        title={<T k="headingHome" />}
        subtitle={<T k="noClubAttached" />}
        headerExtra={
          <>
            <CurrencyScope scope={scope} fallback={fallback} />
            <CurrencySwitcher />
            <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
            <LocaleSwitcher />
          </>
        }
      >
        {tasksPanel}
      </AppShell>
    );
  }

  // ---------------------------------------------------------------------
  // Partner / staff: this club's own dashboard (same fetch/computation the
  // old /dashboard/[partnerId] page did for the caller's own club).
  const partnerId = profile.partner_id;
  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, country")
    .eq("id", partnerId)
    .single();

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
  // See the HQ branch above — same start-date attribution for revenue.
  const clubPayments = (payments ?? []).map((p) => ({
    ...p,
    enrollment: (p as { member_enrollments?: { start_date: string | null; created_at: string } | null })
      .member_enrollments ?? null,
    lead: (p as { leads?: { cohort_start_date: string | null; added_date: string } | null }).leads ?? null,
  }));
  const productNamesById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const period = parsePeriodParams(params);
  const monthOptions = monthsWithActivity(clubLeads, clubEnrollments, clubPayments);
  const metrics = computeCoreMetrics({ leads: clubLeads, enrollments: clubEnrollments, payments: clubPayments, period });

  const enrollmentsInPeriod = clubEnrollments.filter((e) => inPeriod(period, enrollmentAttributionDate(e)));

  const totals = {
    leads: clubLeads.length,
    members: clubMembers.length,
    collected: clubPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0),
    pending: clubPayments.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0),
  };

  return (
    <AppShell
      profile={profile}
      title={<T k="headingHome" />}
      subtitle={
        <>
          {profile.partner_name ?? <T k="noClubAttached" />} · {roleLabelKey ? <T k={roleLabelKey} /> : profile.role}
        </>
      }
      headerExtra={
        <>
          <CurrencyScope scope={scope} fallback={partner ? currencyForCountry(partner.country) : fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={partner ? localeForCountry(partner.country) : localeScope.fallback} />
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
        tasksPanel={tasksPanel}
        period={period}
        monthOptions={monthOptions}
        basePath="/"
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
