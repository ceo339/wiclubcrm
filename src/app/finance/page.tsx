import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId, getViewMode } from "@/lib/viewScope";
import { computeCash, computeInvestments, computeNetworkRow, computeProfitLoss, computeWorkshops, effectivePlan, isWorkshopName, periodMonths, shiftMonth, workshopProductIds, type PlanType } from "@/lib/finance/report";
import { loadClubFinance } from "@/lib/server/finance";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import FinanceNav, { type FinTab } from "@/components/finance/FinanceNav";
import PlanFactTab from "@/components/finance/PlanFactTab";
import EntriesTab from "@/components/finance/EntriesTab";
import { InvestmentSummaryView, WorkshopSummary } from "@/components/finance/FinSummaries";
import CashTab from "@/components/finance/CashTab";
import PlanTab from "@/components/finance/PlanTab";
import NetworkTab, { type NetworkClub } from "@/components/finance/NetworkTab";
import CityBack from "@/components/finance/CityBack";

const TABS: FinTab[] = ["pf", "exp", "inc", "ws", "inv", "cash", "plan"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; cat?: string; plan?: string }>;
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
  // старые ссылки «Расходы и доходы» (tab=journal) ведут на «Расходы»
  const tabIn = sp.tab === "journal" ? "exp" : sp.tab;
  const tabRaw = (TABS as string[]).includes(tabIn ?? "") ? (tabIn as FinTab) : "pf";

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
    const netData: Awaited<ReturnType<typeof loadClubFinance>>[] = [];
    for (const c of clubs ?? []) {
      const data = await loadClubFinance(supabase, c.id);
      netData.push(data);
      const status = data.acceptedMonths[period] ? "accepted" : data.filledMonths.includes(period) ? "filled" : "empty";
      rows.push({ id: c.id, name: c.name, row: computeNetworkRow(data, period), status: /^\d{4}-\d{2}$/.test(period) ? status : null });
    }
    // месяцы и годы — от самого раннего месяца с планом/данными по любому клубу
    const netSet = new Set<string>([curMonth]);
    if (/^\d{4}-\d{2}$/.test(period)) netSet.add(period);
    for (const c of netData) c.plan.forEach((p) => netSet.add(p.month.slice(0, 7)));
    const months = [...netSet].sort();
    const netYears = [...new Set(months.map((m) => m.slice(0, 4)))];
    return shell(
      <div>
        <FinanceNav tab="pf" period={period} months={months} years={netYears} filledMonths={[]} hideTabs />
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
  // Два плана (раунды 82–83): план УК и план партнёра видят все (партнёр тоже), в план/факте —
  // отдельными колонками, в редакторе переключателем. План УК правит только hq; план партнёра —
  // партнёр и hq. Месяц, который партнёр ещё не правил, берётся из плана УК (effectivePlan).
  const planType: PlanType = sp.plan === "uk" || (sp.plan !== "partner" && networkView) ? "uk" : "partner";
  const planRows = effectivePlan(data.plan, planType);
  const monthHasOwnPartnerPlan = data.plan.some((p) => p.plan_type === "partner" && p.month.slice(0, 7) === period);
  // Round 112: Workshop и тренинги считаются отдельно (вкладка «Workshop»); в план/факт месяца не входят,
  // в годовой отчёт входят.
  const wsIds = workshopProductIds(data.products);
  const isWsPay = (p: { product_id: string | null; product: string | null }) => (p.product_id ? wsIds.has(p.product_id) : isWorkshopName(p.product));
  const invCats = new Set(data.categories.filter((c) => c.cash_group === "investment").map((c) => c.id));
  const incomeCats = new Set(data.categories.filter((c) => c.kind === "income").map((c) => c.id));
  const inPeriod = (d: string) => monthsOfPeriod.has(d.slice(0, 7));
  if (tab === "pf") {
    const exclude = /^\d{4}-\d{2}$/.test(period) ? wsIds : undefined;
    const pl = computeProfitLoss(data, period, now, "partner", { exclude });
    // Round 92: план/факт партнёра считается только от плана партнёра (без колонок и подсказок УК);
    // сравнение с планом УК — только у головного офиса и финдиректора. План УК партнёр видит во вкладке «План».
    const plUk = networkView ? computeProfitLoss(data, period, now, "uk", { exclude }) : undefined;
    content = (
      <>
      {wsIds.size > 0 && <p className="mb-3 text-sm text-muted"><T k={exclude ? "finPfWsMonthNote" : "finPfWsYearNote"} /></p>}
      <PlanFactTab
        pl={pl}
        uk={plUk}
        period={period}
        filled={data.filledMonths.includes(period)}
        canManage={canManage}
        accepted={data.acceptedMonths[period] ?? null}
        canAccept={profile.role === "hq" && !!scopePartnerId}
        hasAnyPlan={data.plan.some((p) => monthsOfPeriod.has(p.month.slice(0, 7)))}
      />
      </>
    );
  } else if (tab === "exp") {
    content = (
      <EntriesTab
        mode="expense" tab="exp"
        categories={data.categories}
        products={data.products}
        expenses={data.expenses.filter((e) => inPeriod(e.date) && !invCats.has(e.category_id) && !incomeCats.has(e.category_id) && !(e.product_id && wsIds.has(e.product_id)))}
        canManage={canManage}
        catFilter={sp.cat ?? null}
        period={period}
      />
    );
  } else if (tab === "inc") {
    content = (
      <EntriesTab
        mode="income" tab="inc"
        categories={data.categories}
        products={data.products}
        expenses={data.expenses.filter((e) => inPeriod(e.date) && incomeCats.has(e.category_id) && !(e.product_id && wsIds.has(e.product_id)))}
        payments={data.journalPayments.filter((p) => inPeriod(p.paid_date) && !isWsPay(p))}
        canManage={canManage}
        period={period}
      />
    );
  } else if (tab === "ws") {
    const ws = computeWorkshops(data, period, data.payProducts);
    content = (
      <EntriesTab
        mode="workshop" tab="ws"
        categories={data.categories}
        products={data.products}
        expenses={data.expenses.filter((e) => inPeriod(e.date) && !!e.product_id && wsIds.has(e.product_id) && !invCats.has(e.category_id))}
        payments={data.journalPayments.filter((p) => inPeriod(p.paid_date) && isWsPay(p))}
        canManage={canManage}
        catFilter={sp.cat ?? null}
        period={period}
        summary={<WorkshopSummary {...ws} />}
      />
    );
  } else if (tab === "inv") {
    // инвестиции — разовые вложения, показываем все за всё время, независимо от выбранного месяца
    content = (
      <EntriesTab
        mode="investment" tab="inv"
        categories={data.categories}
        products={data.products}
        expenses={data.expenses.filter((e) => invCats.has(e.category_id))}
        canManage={canManage}
        catFilter={sp.cat ?? null}
        period={period}
        summary={<InvestmentSummaryView s={computeInvestments(data, curMonth)} />}
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
        key={`${planType}-${period}`}
        month={period}
        products={data.products}
        categories={data.categories}
        plan={planRows}
        prevMonth={shiftMonth(period, -1)}
        prevHasPlan={planRows.some((p) => p.month.slice(0, 7) === shiftMonth(period, -1))}
        lastChange={planType === "uk" ? data.lastPlanChangeUk : data.lastPlanChange}
        canManage={canManage && (planType === "partner" || profile.role === "hq")}
        planType={planType}
        fromUk={planType === "partner" && !monthHasOwnPartnerPlan && planRows.some((p) => p.month.slice(0, 7) === period)}
        switchHrefs={{ uk: `/finance?tab=plan&month=${period}&plan=uk`, partner: `/finance?tab=plan&month=${period}&plan=partner` }}
      />
    );
  }

  return shell(
    <div>
      {networkView && <CityBack />}
      <FinanceNav tab={tab} period={period} months={months} years={years} filledMonths={data.filledMonths} acceptedMonths={Object.keys(data.acceptedMonths)} extraQuery={tab === "plan" ? `&plan=${planType}` : ""} />
      {content}
    </div>
  );
}
