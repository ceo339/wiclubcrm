import { add, amt, isZero, scale, sub, sum, zero, type Amt } from "./amt";

/**
 * Раздел «Финансы» (раунд 77) — чистые расчёты, без БД. Принципы из макета:
 *  • выручка — по услуге: платёж, привязанный к записи, идёт в месяц СТАРТА ПОТОКА
 *    (как dashboard.enrollmentAttributionDate); платёж без записи в выручку не входит;
 *  • деньги (ДДС) — по дате оплаты;
 *  • роялти / МКФ считаются сами от выручки; остальные расходы (в т.ч. эквайринг и налоги) вносит партнёр.
 */

export type Cat = {
  id: string;
  partner_id: string | null;
  parent_id: string | null;
  name: string;
  kind: "expense" | "income";
  per_product: boolean;
  auto_kind: "royalty" | "mkf" | null;
  auto_percent: number | null;
  cash_group: "operating" | "acquiring" | "uk_payment" | "investment" | "tax";
  in_pl: boolean;
  sort: number;
  archived: boolean;
};
export type Exp = {
  id: string;
  date: string;
  category_id: string;
  product_id: string | null;
  amount: number;
  amount_local: number | null;
  local_currency: string | null;
  comment: string | null;
  amount_usd?: number | null;
};
/** Два плана (раунд 82): «uk» — план УК (финмодель, видят только hq/viewer), «partner» — план партнёра. */
export type PlanType = "uk" | "partner";
export type PlanRow = {
  plan_type: PlanType;
  month: string; // YYYY-MM-01
  kind: "revenue" | "expense";
  category_id: string | null;
  product_id: string | null;
  qty: number | null;
  amount: number;
  amount_local: number | null;
  local_currency: string | null;
  amount_usd?: number | null;
};
export type Prod = { id: string; name: string; price: number };

/**
 * Строки нужного плана. План партнёра «наследует» план УК: месяц, в котором у партнёра
 * ещё нет своих строк, берётся из плана УК (Анастасия: «пустым не оставляй, бери данные
 * на след месяц из плана УК»). Как только партнёр сохранит месяц — действует его версия.
 */
export function effectivePlan(plan: PlanRow[], planType: PlanType): PlanRow[] {
  const uk = plan.filter((p) => p.plan_type === "uk");
  if (planType === "uk") return uk;
  const own = plan.filter((p) => p.plan_type === "partner");
  const ownMonths = new Set(own.map((p) => p.month.slice(0, 7)));
  return [...own, ...uk.filter((p) => !ownMonths.has(p.month.slice(0, 7))).map((p) => ({ ...p, plan_type: "partner" as const }))];
}
export type EnrInfo = { product_id: string; start_date: string | null; created_at: string; status: string };
export type Pay = {
  id: string;
  amount: number;
  amount_local: number | null;
  local_currency: string | null;
  status: string;
  paid_date: string;
  enrollment_id: string | null;
  enr: EnrInfo | null;
  amount_usd?: number | null;
};
export type Settings = {
  opening_balance: number;
  opening_balance_local: number | null;
  local_currency: string | null;
  opening_month: string; // YYYY-MM-01
} | null;

export type ClubFinance = {
  products: Prod[];
  categories: Cat[];
  expenses: Exp[];
  plan: PlanRow[];
  payments: Pay[];
  enrollments: (EnrInfo & { id: string })[];
  settings: Settings;
};

const mk = (d: string) => d.slice(0, 7);

/** «2026-09» → [«2026-09»]; «2026» → 12 месяцев. */
export function periodMonths(period: string): string[] {
  if (/^\d{4}$/.test(period)) return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);
  return [period];
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const attrMonth = (e: EnrInfo) => mk(e.start_date ?? e.created_at.slice(0, 10));

export function autoPercents(cats: Cat[]) {
  const pick = (kind: "royalty" | "mkf", def: number) => {
    const own = cats.find((c) => c.auto_kind === kind && c.partner_id !== null && !c.archived);
    const std = cats.find((c) => c.auto_kind === kind);
    return Number((own ?? std)?.auto_percent ?? def);
  };
  return { royalty: pick("royalty", 10), mkf: pick("mkf", 2) };
}

// ---------------------------------------------------------------- P&L

export type Line = { id: string; name: string; plan: Amt; fact: Amt };
export type RevenueLine = Line & {
  planQty: number;
  counts: { enrolled: number; came: number; paid: number; free: number };
};
export type LeafLine = Line & { perProduct: boolean; autoPercent: number | null; products: Line[] };
export type GroupLine = Line & { leaves: LeafLine[]; isTax: boolean; inPl: boolean };

export type ProfitLoss = {
  period: string;
  revenue: RevenueLine[];
  idleProducts: string[];
  otherIncome: Amt;
  revenuePlan: Amt;
  revenueFact: Amt;
  groups: GroupLine[];
  expensesPlan: Amt;
  expensesFact: Amt;
  profitPlan: Amt;
  profitFact: Amt;
  taxesPlan: Amt;
  taxesFact: Amt;
  netProfitPlan: Amt;
  netProfitFact: Amt;
  cumulative: { fact: Amt; plan: Amt; fromMonth: string } | null;
  pace: { elapsed: number; days: number; plannedToDate: Amt } | null;
};

function planRevenueTotal(f: ClubFinance, months: Set<string>): Amt {
  return sum(f.plan.filter((p) => p.kind === "revenue" && months.has(mk(p.month))).map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
}
function factRevenueByProduct(f: ClubFinance, months: Set<string>): Map<string, Amt> {
  const m = new Map<string, Amt>();
  for (const p of f.payments) {
    if (p.status !== "paid" || !p.enr || !months.has(attrMonth(p.enr))) continue;
    m.set(p.enr.product_id, add(m.get(p.enr.product_id) ?? zero(), amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
  }
  return m;
}
function factRevenueTotal(f: ClubFinance, months: Set<string>): Amt {
  return sum([...factRevenueByProduct(f, months).values()]);
}

/**
 * Round 112: Workshop и тренинги — отдельная вкладка «Workshop» со своими доходами и расходами.
 * Продукт относится к Workshop по названию (Workshop / воркшоп / тренинг).
 */
export function isWorkshopName(name: string | null | undefined): boolean {
  return !!name && /workshop|воркшоп|тренинг|training/i.test(name);
}
export function workshopProductIds(products: Prod[]): Set<string> {
  return new Set(products.filter((p) => isWorkshopName(p.name)).map((p) => p.id));
}

/** Клуб без указанных продуктов: их выручка, записи, расходы и строки плана не учитываются. */
export function withoutProducts(f: ClubFinance, ids: Set<string>): ClubFinance {
  if (!ids.size) return f;
  return {
    ...f,
    products: f.products.filter((p) => !ids.has(p.id)),
    payments: f.payments.filter((p) => !(p.enr && ids.has(p.enr.product_id))),
    enrollments: f.enrollments.filter((e) => !ids.has(e.product_id)),
    expenses: f.expenses.filter((e) => !(e.product_id && ids.has(e.product_id))),
    plan: f.plan.filter((p) => !(p.product_id && ids.has(p.product_id))),
  };
}

export function computeProfitLoss(f00: ClubFinance, period: string, today: Date, planType: PlanType = "partner", opts?: { exclude?: Set<string> }): ProfitLoss {
  const f0 = opts?.exclude ? withoutProducts(f00, opts.exclude) : f00;
  const f: ClubFinance = { ...f0, plan: effectivePlan(f0.plan, planType) };
  const months = new Set(periodMonths(period));
  const pct = autoPercents(f.categories);

  // --- revenue
  const factBy = factRevenueByProduct(f, months);
  const paidEnr = new Set(f.payments.filter((p) => p.status === "paid" && p.enrollment_id).map((p) => p.enrollment_id as string));
  const planBy = new Map<string, { qty: number; amt: Amt }>();
  for (const p of f.plan) {
    if (p.kind !== "revenue" || !p.product_id || !months.has(mk(p.month))) continue;
    const cur = planBy.get(p.product_id) ?? { qty: 0, amt: zero() };
    planBy.set(p.product_id, { qty: cur.qty + Number(p.qty ?? 0), amt: add(cur.amt, amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)) });
  }
  const revenue: RevenueLine[] = [];
  const idle: string[] = [];
  for (const prod of f.products) {
    const enrs = f.enrollments.filter((e) => e.product_id === prod.id && months.has(attrMonth(e)) && e.status !== "sCancelled" && e.status !== "sFailed");
    const came = enrs.filter((e) => e.status === "sPaid" || e.status === "sCompleted");
    const paid = came.filter((e) => paidEnr.has(e.id)).length;
    const plan = planBy.get(prod.id);
    const fact = factBy.get(prod.id) ?? zero();
    if (!plan && isZero(fact) && enrs.length === 0) {
      idle.push(prod.name);
      continue;
    }
    revenue.push({
      id: prod.id,
      name: prod.name,
      plan: plan?.amt ?? zero(),
      fact,
      planQty: plan?.qty ?? 0,
      counts: { enrolled: enrs.length, came: came.length, paid, free: came.length - paid },
    });
  }
  const otherIncome = sum(
    f.expenses
      .filter((e) => months.has(mk(e.date)) && f.categories.find((c) => c.id === e.category_id)?.kind === "income")
      .map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd))
  );
  const revenuePlan = sum(revenue.map((r) => r.plan));
  const serviceFact = sum(revenue.map((r) => r.fact));
  const revenueFact = add(serviceFact, otherIncome);

  // --- expenses
  const cats = f.categories;
  const groupsRaw = cats.filter((c) => !c.parent_id && c.kind === "expense").sort((a, b) => a.sort - b.sort);
  const groups: GroupLine[] = [];
  for (const g of groupsRaw) {
    const leaves: LeafLine[] = [];
    for (const leaf of cats.filter((c) => c.parent_id === g.id).sort((a, b) => a.sort - b.sort)) {
      let plan = zero();
      let fact = zero();
      const products: Line[] = [];
      if (leaf.auto_kind) {
        const p = Number(leaf.auto_percent ?? pct[leaf.auto_kind]);
        plan = scale(revenuePlan, p / 100);
        fact = scale(serviceFact, p / 100);
      } else {
        const exps = f.expenses.filter((e) => e.category_id === leaf.id && months.has(mk(e.date)));
        const plans = f.plan.filter((p) => p.kind === "expense" && p.category_id === leaf.id && months.has(mk(p.month)));
        fact = sum(exps.map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd)));
        plan = sum(plans.map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
        if (leaf.per_product) {
          const ids = new Set<string | null>([...exps.map((e) => e.product_id), ...plans.map((p) => p.product_id)]);
          for (const pid of ids) {
            const name = pid ? (f.products.find((x) => x.id === pid)?.name ?? "—") : "без курса";
            products.push({
              id: pid ?? "none",
              name,
              plan: sum(plans.filter((p) => p.product_id === pid).map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd))),
              fact: sum(exps.filter((e) => e.product_id === pid).map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd))),
            });
          }
          const order = (id: string) => { const i = f.products.findIndex((x) => x.id === id); return i === -1 ? 999 : i; };
          products.sort((a, b) => order(a.id) - order(b.id));
        }
      }
      if (leaf.archived && isZero(plan) && isZero(fact)) continue;
      leaves.push({ id: leaf.id, name: leaf.name, plan, fact, perProduct: leaf.per_product, autoPercent: leaf.auto_kind ? Number(leaf.auto_percent ?? pct[leaf.auto_kind]) : null, products });
    }
    if (g.archived && leaves.length === 0) continue;
    groups.push({
      id: g.id,
      name: g.name,
      plan: sum(leaves.map((l) => l.plan)),
      fact: sum(leaves.map((l) => l.fact)),
      leaves,
      isTax: g.cash_group === "tax",
      inPl: g.in_pl,
    });
  }
  const plGroups = groups.filter((g) => g.inPl && !g.isTax);
  const expensesPlan = sum(plGroups.map((g) => g.plan));
  const expensesFact = sum(plGroups.map((g) => g.fact));
  const taxesPlan = sum(groups.filter((g) => g.isTax).map((g) => g.plan));
  const taxesFact = sum(groups.filter((g) => g.isTax).map((g) => g.fact));
  const profitPlan = sub(revenuePlan, expensesPlan);
  const profitFact = sub(revenueFact, expensesFact);

  // --- накопленное отставание с начала плана
  const planMonths = f.plan.filter((p) => p.kind === "revenue").map((p) => mk(p.month)).sort();
  const lastMonthOfPeriod = /^\d{4}$/.test(period)
    ? (() => {
        const cur = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
        const dec = `${period}-12`;
        return cur < dec && cur.startsWith(period) ? cur : dec;
      })()
    : period;
  let cumulative: ProfitLoss["cumulative"] = null;
  if (planMonths.length) {
    const from = planMonths[0];
    const upTo = new Set<string>();
    for (let m = from; m <= lastMonthOfPeriod && upTo.size < 60; m = shiftMonth(m, 1)) upTo.add(m);
    if (upTo.size) cumulative = { fact: factRevenueTotal(f, upTo), plan: planRevenueTotal(f, upTo), fromMonth: from };
  }

  // --- темп текущего месяца
  let pace: ProfitLoss["pace"] = null;
  const curKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  if (period === curKey && !isZero(revenuePlan)) {
    const days = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = today.getUTCDate();
    pace = { elapsed, days, plannedToDate: scale(revenuePlan, elapsed / days) };
  }

  return {
    period, revenue, idleProducts: idle, otherIncome, revenuePlan, revenueFact,
    groups, expensesPlan, expensesFact, profitPlan, profitFact,
    taxesPlan, taxesFact,
    netProfitPlan: sub(profitPlan, taxesPlan), netProfitFact: sub(profitFact, taxesFact),
    cumulative, pace,
  };
}

// ---------------------------------------------------------------- ДДС

export type CashMonth = {
  month: string;
  receipts: Amt;
  otherIncome: Amt;
  operating: Amt;
  acquiring: Amt;
  ukPayment: Amt;
  tax: Amt;
  investment: Amt;
  net: Amt;
  closing: Amt;
};

export function computeCash(f: ClubFinance, endMonth: string, count: number): { months: CashMonth[]; opening: Amt; hasOpening: boolean } {
  const pct = autoPercents(f.categories);
  const catOf = new Map(f.categories.map((c) => [c.id, c]));
  const paid = f.payments.filter((p) => p.status === "paid");

  const dates = [...paid.map((p) => mk(p.paid_date)), ...f.expenses.map((e) => mk(e.date))].sort();
  const start = f.settings ? mk(f.settings.opening_month) : (dates[0] ?? endMonth);
  const opening = f.settings
    ? amt(f.settings.opening_balance, f.settings.opening_balance_local, f.settings.local_currency)
    : zero();

  const receiptsOf = (m: string) =>
    sum(paid.filter((p) => mk(p.paid_date) === m).map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));

  const all: CashMonth[] = [];
  let closing = opening;
  for (let m = start; m <= endMonth && all.length < 120; m = shiftMonth(m, 1)) {
    const exps = f.expenses.filter((e) => mk(e.date) === m);
    const byGroup = (g: Cat["cash_group"]) =>
      sum(exps.filter((e) => { const c = catOf.get(e.category_id); return c && c.kind === "expense" && c.cash_group === g; }).map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd)));
    const receipts = receiptsOf(m);
    const otherIncome = sum(exps.filter((e) => catOf.get(e.category_id)?.kind === "income").map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd)));
    const operating = byGroup("operating");
    const tax = byGroup("tax");
    const investment = byGroup("investment");
    const acquiring = byGroup("acquiring");
    const ukPayment = scale(receiptsOf(shiftMonth(m, -1)), (pct.royalty + pct.mkf) / 100);
    const outflow = sum([operating, tax, investment, acquiring, ukPayment]);
    const net = sub(add(receipts, otherIncome), outflow);
    closing = add(closing, net);
    all.push({ month: m, receipts, otherIncome, operating, acquiring, ukPayment, tax, investment, net, closing });
  }
  return { months: all.slice(-count), opening, hasOpening: !!f.settings };
}

// ---------------------------------------------------------------- сеть (HQ)

export type NetworkRow = {
  planRevenue: Amt;
  planRevenueUk: Amt;
  factRevenue: Amt;
  ukDue: Amt;
  hasPlan: boolean;
  hasPlanUk: boolean;
};

export function computeNetworkRow(f: ClubFinance, period: string): NetworkRow {
  const months = new Set(periodMonths(period));
  const pct = autoPercents(f.categories);
  const factRevenue = factRevenueTotal(f, months);
  const partner = { ...f, plan: effectivePlan(f.plan, "partner") };
  const uk = { ...f, plan: effectivePlan(f.plan, "uk") };
  return {
    planRevenue: planRevenueTotal(partner, months),
    planRevenueUk: planRevenueTotal(uk, months),
    factRevenue,
    ukDue: scale(factRevenue, (pct.royalty + pct.mkf) / 100),
    hasPlan: partner.plan.some((p) => months.has(mk(p.month))),
    hasPlanUk: uk.plan.some((p) => months.has(mk(p.month))),
  };
}

// ---------------------------------------------------------------- Workshop (Round 112)

export type WorkshopLine = {
  id: string;
  name: string;
  revenue: Amt;
  expenses: Amt;
  profit: Amt;
  planRevenue: Amt;
  planExpenses: Amt;
  paid: number;
};

/**
 * Workshop и тренинги за период: доход — оплаты по продукту (месяц старта потока, как в план/факте;
 * оплата без записи — по дате оплаты), расходы — записи журнала с этим продуктом.
 */
export function computeWorkshops(f: ClubFinance, period: string, payProducts: Map<string, string | null>, planType: PlanType = "partner"): { lines: WorkshopLine[]; revenue: Amt; expenses: Amt; profit: Amt } {
  const months = new Set(periodMonths(period));
  const ids = workshopProductIds(f.products);
  const plan = effectivePlan(f.plan, planType);
  const lines: WorkshopLine[] = [];
  for (const prod of f.products.filter((p) => ids.has(p.id))) {
    const pays = f.payments.filter((p) => {
      if (p.status !== "paid") return false;
      const pid = p.enr?.product_id ?? payProducts.get(p.id) ?? null;
      if (pid !== prod.id) return false;
      return months.has(p.enr ? attrMonth(p.enr) : mk(p.paid_date));
    });
    const exps = f.expenses.filter((e) => e.product_id === prod.id && months.has(mk(e.date)));
    const revenue = sum(pays.map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
    const expenses = sum(exps.map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd)));
    const pl = plan.filter((p) => p.product_id === prod.id && months.has(mk(p.month)));
    const planRevenue = sum(pl.filter((p) => p.kind === "revenue").map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
    const planExpenses = sum(pl.filter((p) => p.kind === "expense").map((p) => amt(p.amount, p.amount_local, p.local_currency, p.amount_usd)));
    lines.push({ id: prod.id, name: prod.name, revenue, expenses, profit: sub(revenue, expenses), planRevenue, planExpenses, paid: pays.length });
  }
  const revenue = sum(lines.map((l) => l.revenue));
  const expenses = sum(lines.map((l) => l.expenses));
  return { lines, revenue, expenses, profit: sub(revenue, expenses) };
}

// ---------------------------------------------------------------- Инвестиции (Round 112)

export type InvestmentSummary = {
  invested: Amt;
  /** накопленный денежный поток без инвестиций: поступления − операционные выплаты − платёж УК − налоги */
  earned: Amt;
  left: Amt;
  paidBack: boolean;
  fromMonth: string | null;
};

export function computeInvestments(f: ClubFinance, upToMonth: string): InvestmentSummary {
  const invCats = new Set(f.categories.filter((c) => c.cash_group === "investment" && c.kind === "expense").map((c) => c.id));
  const inv = f.expenses.filter((e) => invCats.has(e.category_id));
  const invested = sum(inv.map((e) => amt(e.amount, e.amount_local, e.local_currency, e.amount_usd)));
  const cash = computeCash(f, upToMonth, 120);
  const earned = sum(cash.months.map((m) => add(m.net, m.investment)));
  const left = sub(invested, earned);
  const fromMonth = [...inv.map((e) => mk(e.date))].sort()[0] ?? cash.months[0]?.month ?? null;
  return { invested, earned, left, paidBack: invested.eur > 0 && left.eur <= 0, fromMonth };
}
