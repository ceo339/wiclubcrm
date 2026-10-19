import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId, getViewMode } from "@/lib/viewScope";
import { computeCash, computeNetworkRow, computeProfitLoss, periodMonths, shiftMonth } from "@/lib/finance/report";
import { loadClubFinance } from "@/lib/server/finance";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import FinanceNav, { type FinTab } from "@/components/finance/FinanceNav";
import PlanFactTab from "@/components/finance/PlanFactTab";
import JournalTab from "@/components/finance/JournalTab";
import CashTab from "@/components/finance/CashTab";
import PlanTab from "@/components/finance/PlanTab";
import NetworkTab, { type NetworkClub } from "@/components/finance/NetworkTab";
import CityBack from "@/components/finance/CityBack";

const TABS: FinTab[] = ["pf", "journal", "cash", "plan"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // «Финансы» клуба: партнёр, hq и viewer (финдиректор / таргетолог — только просмотр)
  if (!["partner", "hq", "viewer"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);
  const viewMode = await getViewMode(profile);
  const clubId = profile.partner_id ?? scopePartnerId;
  const canManage = (profile.role === "partner" && !!profile.partner_id) || (profile.role === "hq" && !!scopePartnerId);

  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const requested = sp.month && /^\d{4}(-\d{2})?$/.test(sp.month) ? sp.month : curMonth;
  const tabRaw = (TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as FinTab) : "pf";

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name, country").order("name")
    : { data: [] as { id: string; name: string; country: string | null }[] };

  const localeScope = localeScopeForProfile(profile);
  const country = profile.partner_id
    ? profile.partner_country
    : (clubs ?? []).find((c) => c.id === clubId)?.country ?? null;
  const currencyScope = clubId ? { scope: `club:${clubId}`, fallback: currencyForCountry(country) } : { scope: "network", fallback: "USD" as const };

  const shell = (body: React.ReactNode) => (
    <AppShell
      profile={profile}
      title={<T k="navFinance" />}
      subtitle={<T k="finSubtitle" />}
      clubs={(clubs ?? []).map((c) => ({ id: c.id, name: c.name }))}
      activeClubId={scopePartnerId}
      viewMode={viewMode}
      headerExtra={
        <>
          <CurrencyScope scope={currencyScope.scope} fallback={currencyScope.fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {body}
    </AppShell>
  );

  // ---- сеть: HQ / viewer без выбранного клуба
  if (!clubId) {
    const period = requested;
    const rows: NetworkClub[] = [];
    for (const c of clubs ?? []) {
      const data = await loadClubFinance(supabase, c.id);
      rows.push({ id: c.id, name: c.name, row: computeNetworkRow(data, period) });
    }
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(curMonth, i - 11));
    return shell(
      <div>
        <FinanceNav tab="pf" period={period} months={months} years={[String(now.getUTCFullYear())]} filledMonths={[]} hideTabs />
        <NetworkTab clubs={rows} period={period} />
        <p className="mt-4 text-sm text-muted"><T k="finPickClubHint" /></p>
      </div>
    );
  }

  // ---- один клуб
  const data = await loadClubFinance(supabase, clubId);
  const monthSet = new Set<string>([curMonth]);
  data.expenses.forEach((e) => monthSet.add(e.date.slice(0, 7)));
  data.plan.forEach((p) => monthSet.add(p.month.slice(0, 7)));
  data.payments.forEach((p) => {
    if (p.enr) monthSet.add((p.enr.start_date ?? p.enr.created_at.slice(0, 10)).slice(0, 7));
  });
  let period = requested;
  if (/^\d{4}-\d{2}$/.test(period)) monthSet.add(period);
  // план правится по одному месяцу: на «весь год» открываем текущий месяц этого года
  if (tabRaw === "plan" && /^\d{4}$/.test(period)) period = period === curMonth.slice(0, 4) ? curMonth : `${period}-01`;
  // все месяцы с данными или планом, слева направо от самого раннего (раньше брались последние 12 — из-за плана на 24 месяца вперёд список уезжал в 2027–2028)
  const months = [...monthSet].sort();
  const years = [...new Set([...monthSet].map((m) => m.slice(0, 4)))].sort();
  const tab = tabRaw;
  const monthsOfPeriod = new Set(periodMonths(period));

  let content: React.ReactNode = null;
  if (tab === "pf") {
    const pl = computeProfitLoss(data, period, now);
    content = (
      <PlanFactTab
        pl={pl}
        period={period}
        filled={data.filledMonths.includes(period)}
        canManage={canManage}
        hasAnyPlan={data.plan.some((p) => monthsOfPeriod.has(p.month.slice(0, 7)))}
      />
    );
  } else if (tab === "journal") {
    content = (
      <JournalTab
        categories={data.categories}
        products={data.products}
        expenses={data.expenses.filter((e) => monthsOfPeriod.has(e.date.slice(0, 7)))}
        payments={data.journalPayments.filter((p) => monthsOfPeriod.has(p.paid_date.slice(0, 7)))}
        canManage={canManage}
        catFilter={sp.cat ?? null}
        period={period}
      />
    );
  } else if (tab === "cash") {
    const isYear = /^\d{4}$/.test(period);
    const end = isYear ? (period < curMonth.slice(0, 4) ? `${period}-12` : period === curMonth.slice(0, 4) ? curMonth : `${period}-01`) : period;
    const cash = computeCash(data, end, isYear ? 12 : 6);
    content = (
      <CashTab months={cash.months} hasOpening={cash.hasOpening} settings={data.settings} canManage={canManage} firstMonth={months[0] ?? curMonth} />
    );
  } else {
    content = (
      <PlanTab
        key={period}
        month={period}
        products={data.products}
        categories={data.categories}
        plan={data.plan}
        prevMonth={shiftMonth(period, -1)}
        prevHasPlan={data.plan.some((p) => p.month.slice(0, 7) === shiftMonth(period, -1))}
        lastChange={data.lastPlanChange}
        canManage={canManage}
      />
    );
  }

  return shell(
    <div>
      {networkView && <CityBack />}
      <FinanceNav tab={tab} period={period} months={months} years={years} filledMonths={data.filledMonths} />
      {content}
    </div>
  );
}
