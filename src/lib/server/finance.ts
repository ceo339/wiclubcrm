import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Cat, ClubFinance, Exp, PlanRow, Settings } from "@/lib/finance/report";

type Db = SupabaseClient<Database>;

/** PostgREST отдаёт максимум 1000 строк за запрос — читаем постранично. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type JournalPayment = {
  id: string;
  paid_date: string;
  amount: number;
  amount_local: number | null;
  local_currency: string | null;
  status: string;
  member: string | null;
  product: string | null;
  linked: boolean;
};

/** «Отчёт принят» головным офисом (раунд 84) — месяц → когда и кто принял. */
export type AcceptedMonths = Record<string, { at: string | null; by: string | null }>;

export type ClubFinanceData = ClubFinance & {
  filledMonths: string[];
  acceptedMonths: AcceptedMonths;
  lastPlanChange: string | null;
  lastPlanChangeUk: string | null;
  journalPayments: JournalPayment[];
};

/** Всё, что нужно разделу «Финансы» по одному клубу (через RLS-клиента пользователя). */
export async function loadClubFinance(db: Db, partnerId: string): Promise<ClubFinanceData> {
  const [products, categories, expenses, plan, payments, enrollments, settingsRes, monthsRes, logRes] = await Promise.all([
    db.from("products").select("id, name, price").eq("partner_id", partnerId).order("created_at"),
    db.from("fin_categories").select("*").or(`partner_id.is.null,partner_id.eq.${partnerId}`).order("sort"),
    fetchAll((a, b) => db.from("fin_expenses").select("*").eq("partner_id", partnerId).order("date", { ascending: false }).range(a, b)),
    fetchAll((a, b) => db.from("fin_plan").select("*").eq("partner_id", partnerId).range(a, b)),
    fetchAll((a, b) =>
      db
        .from("payments")
        .select(
          "id, amount, amount_local, local_currency, status, paid_date, enrollment_id, members(name), products(name), member_enrollments(product_id, start_date, created_at, status)"
        )
        .eq("partner_id", partnerId)
        .order("paid_date", { ascending: false })
        .range(a, b)
    ),
    fetchAll((a, b) => db.from("member_enrollments").select("id, product_id, start_date, created_at, status").eq("partner_id", partnerId).range(a, b)),
    db.from("fin_settings").select("*").eq("partner_id", partnerId).maybeSingle(),
    db.from("fin_months").select("month, filled, accepted, accepted_at, accepted_by_name").eq("partner_id", partnerId),
    db.from("fin_plan_log").select("changed_at, plan_type").eq("partner_id", partnerId).order("changed_at", { ascending: false }).limit(50),
  ]);

  type PayRow = {
    id: string; amount: number; amount_local: number | null; local_currency: string | null; status: string; paid_date: string;
    enrollment_id: string | null;
    members: { name: string } | null; products: { name: string } | null;
    member_enrollments: { product_id: string; start_date: string | null; created_at: string; status: string } | null;
  };
  const payRows = payments as unknown as PayRow[];

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const settingsRow = settingsRes.data;
  const settings: Settings = settingsRow
    ? {
        opening_balance: Number(settingsRow.opening_balance),
        opening_balance_local: num(settingsRow.opening_balance_local),
        local_currency: settingsRow.local_currency,
        opening_month: settingsRow.opening_month,
      }
    : null;

  return {
    products: (products.data ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) })),
    categories: (categories.data ?? []).map((c): Cat => ({
      id: c.id, partner_id: c.partner_id, parent_id: c.parent_id, name: c.name,
      kind: c.kind as Cat["kind"], per_product: c.per_product, auto_kind: c.auto_kind as Cat["auto_kind"],
      auto_percent: num(c.auto_percent), cash_group: c.cash_group as Cat["cash_group"], in_pl: c.in_pl, sort: c.sort, archived: c.archived,
    })),
    expenses: expenses.map((e): Exp => ({
      id: e.id, date: e.date, category_id: e.category_id, product_id: e.product_id, amount: Number(e.amount),
      amount_local: num(e.amount_local), local_currency: e.local_currency, comment: e.comment,
    })),
    plan: plan.map((p): PlanRow => ({
      plan_type: p.plan_type === "uk" ? "uk" : "partner",
      month: p.month, kind: p.kind as PlanRow["kind"], category_id: p.category_id, product_id: p.product_id,
      qty: num(p.qty), amount: Number(p.amount), amount_local: num(p.amount_local), local_currency: p.local_currency,
    })),
    payments: payRows.map((p) => ({
      id: p.id, amount: Number(p.amount), amount_local: num(p.amount_local), local_currency: p.local_currency,
      status: p.status, paid_date: p.paid_date, enrollment_id: p.enrollment_id,
      enr: p.member_enrollments,
    })),
    enrollments: enrollments.filter((e) => e.product_id).map((e) => ({ id: e.id, product_id: e.product_id as string, start_date: e.start_date, created_at: e.created_at, status: e.status })),
    settings,
    filledMonths: (monthsRes.data ?? []).filter((m) => m.filled).map((m) => m.month.slice(0, 7)),
    acceptedMonths: Object.fromEntries(
      (monthsRes.data ?? []).filter((m) => m.accepted).map((m) => [m.month.slice(0, 7), { at: m.accepted_at, by: m.accepted_by_name }])
    ),
    lastPlanChange: logRes.data?.find((l) => l.plan_type === "partner")?.changed_at ?? null,
    lastPlanChangeUk: logRes.data?.find((l) => l.plan_type === "uk")?.changed_at ?? null,
    journalPayments: payRows
      .filter((p) => p.status === "paid")
      .map((p) => ({
        id: p.id, paid_date: p.paid_date, amount: Number(p.amount), amount_local: num(p.amount_local),
        local_currency: p.local_currency, status: p.status, member: p.members?.name ?? null,
        product: p.products?.name ?? null, linked: !!p.member_enrollments,
      })),
  };
}
