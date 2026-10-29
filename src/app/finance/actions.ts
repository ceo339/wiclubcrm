"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, type Profile } from "@/lib/auth";
import { getViewScopePartnerId } from "@/lib/viewScope";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_CURRENCY, CURRENCIES } from "@/lib/currency";
import { readLocal } from "@/lib/server/localMoney";
import type { Database } from "@/types/database";
import type { PlanType } from "@/lib/finance/report";

type PlanLogInsert = Database["public"]["Tables"]["fin_plan_log"]["Insert"];

export type FinResult = { error: string | null };

/**
 * Раздел «Финансы» (раунд 77). Чтение идёт через RLS, запись — здесь, через admin-клиент
 * после проверки права (как «Реклама»): партнёр правит только свой клуб, hq — тот клуб,
 * что выбран в шапке; viewer (финдиректор, таргетолог) только смотрит.
 */
async function manageablePartnerId(profile: Profile): Promise<string | null> {
  if (profile.role === "partner" && profile.partner_id) return profile.partner_id;
  if (profile.role === "hq") return getViewScopePartnerId(profile);
  return null;
}

async function guard(): Promise<{ partnerId: string; userId: string; role: Profile["role"] } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };
  return { partnerId, userId: profile.id, role: profile.role };
}

/** План УК правит только hq; план партнёра — партнёр и hq (составляют вместе). */
function planAllowed(role: Profile["role"], planType: PlanType): boolean {
  return planType === "partner" ? role === "partner" || role === "hq" : role === "hq";
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-\d{2}$/.test(v);

// ---------------------------------------------------------------- журнал

type Parsed = {
  date: string;
  category_id: string;
  product_id: string | null;
  amount: number;
  amount_local: number | null;
  local_currency: string | null;
  comment: string | null;
};

async function parseEntry(partnerId: string, formData: FormData): Promise<Parsed | { error: string }> {
  const date = String(formData.get("date") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const productId = String(formData.get("product_id") ?? "") || null;
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!isDate(date)) return { error: "finErrDate" };
  if (!categoryId) return { error: "finErrCategory" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "finErrAmount" };

  const admin = createAdminClient();
  const { data: cat } = await admin
    .from("fin_categories")
    .select("id, partner_id, parent_id, per_product, auto_kind, archived")
    .eq("id", categoryId)
    .maybeSingle();
  // только лист справочника сети или своего клуба; авто-статьи (роялти, МКФ) вручную не вносятся
  if (!cat || !cat.parent_id || (cat.partner_id && cat.partner_id !== partnerId) || cat.auto_kind) return { error: "finErrCategory" };
  if (cat.per_product && !productId) return { error: "finErrProduct" };

  let product_id: string | null = null;
  if (productId) {
    const { data: prod } = await admin.from("products").select("id").eq("id", productId).eq("partner_id", partnerId).maybeSingle();
    if (!prod) return { error: "finErrProduct" };
    product_id = prod.id;
  }
  const loc = readLocal(formData, "amount");
  return { date, category_id: cat.id, product_id, amount, amount_local: loc.local, local_currency: loc.currency, comment };
}

export async function addExpense(formData: FormData): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const p = await parseEntry(g.partnerId, formData);
  if ("error" in p) return p;
  const { error } = await createAdminClient().from("fin_expenses").insert({ ...p, partner_id: g.partnerId, created_by: g.userId });
  if (error) return { error: error.message };
  revalidatePath("/finance");
  return { error: null };
}

export async function updateExpense(id: string, formData: FormData): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const p = await parseEntry(g.partnerId, formData);
  if ("error" in p) return p;
  const { error } = await createAdminClient().from("fin_expenses").update(p).eq("id", id).eq("partner_id", g.partnerId);
  if (error) return { error: error.message };
  revalidatePath("/finance");
  return { error: null };
}

export async function deleteExpense(id: string): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const { error } = await createAdminClient().from("fin_expenses").delete().eq("id", id).eq("partner_id", g.partnerId);
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------- план

export type PlanInput = {
  kind: "revenue" | "expense";
  categoryId: string | null;
  productId: string | null;
  qty: number | null;
  amountEur: number;
  amountLocal: number | null;
  currency: string | null;
};

const lineKey = (kind: string, cat: string | null, prod: string | null) => `${kind}|${cat ?? ""}|${prod ?? ""}`;

/**
 * Round 112: изменения месяца переносятся во все следующие месяцы плана.
 * prices — новая цена продукта за единицу (сумма = кол-во следующего месяца × цена, количество не трогаем);
 * expenses — новая сумма статьи (0 = убрать строку).
 */
export type PlanPropagation = {
  prices: { productId: string; unitEur: number; unitLocal: number | null; currency: string | null }[];
  expenses: { categoryId: string; productId: string | null; amountEur: number; amountLocal: number | null; currency: string | null }[];
};

export async function savePlan(month: string, rows: PlanInput[], planType: PlanType = "partner", propagate?: PlanPropagation): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (planType !== "uk" && planType !== "partner") return { error: "errNotAuthorized" };
  if (!planAllowed(g.role, planType)) return { error: "errNotAuthorized" };
  if (!isMonth(month)) return { error: "finErrDate" };
  const monthDate = `${month}-01`;
  const admin = createAdminClient();

  const [{ data: cats }, { data: prods }, { data: existing }] = await Promise.all([
    admin.from("fin_categories").select("id, partner_id, parent_id, auto_kind").or(`partner_id.is.null,partner_id.eq.${g.partnerId}`),
    admin.from("products").select("id").eq("partner_id", g.partnerId),
    admin.from("fin_plan").select("*").eq("partner_id", g.partnerId).eq("plan_type", planType).eq("month", monthDate),
  ]);
  const okCat = new Set((cats ?? []).filter((c) => c.parent_id && !c.auto_kind).map((c) => c.id));
  const okProd = new Set((prods ?? []).map((p) => p.id));

  const wanted = new Map<string, PlanInput>();
  for (const r of rows) {
    if (r.kind === "revenue") {
      if (!r.productId || !okProd.has(r.productId)) continue;
    } else if (!r.categoryId || !okCat.has(r.categoryId) || (r.productId && !okProd.has(r.productId))) continue;
    const amount = Number(r.amountEur);
    const qty = r.qty === null ? null : Number(r.qty);
    if (!Number.isFinite(amount) || amount < 0) return { error: "finErrAmount" };
    if (amount === 0 && !qty) continue; // пустая строка = «не запланировано»
    wanted.set(lineKey(r.kind, r.kind === "revenue" ? null : r.categoryId, r.productId), r);
  }

  const old = new Map((existing ?? []).map((e) => [lineKey(e.kind, e.category_id, e.product_id), e]));
  const now = new Date().toISOString();
  const log: PlanLogInsert[] = [];
  const cur = (c: string | null) => (c && c !== BASE_CURRENCY && CURRENCIES.some((x) => x.code === c) ? c : null);

  for (const [key, r] of wanted) {
    const prev = old.get(key);
    const amount = Math.round(Number(r.amountEur) * 100) / 100;
    const local = cur(r.currency) && r.amountLocal !== null ? Math.round(Number(r.amountLocal) * 100) / 100 : null;
    const row = {
      partner_id: g.partnerId, plan_type: planType, month: monthDate, kind: r.kind,
      category_id: r.kind === "revenue" ? null : r.categoryId, product_id: r.productId,
      qty: r.qty, amount, amount_local: local, local_currency: local === null ? null : cur(r.currency), updated_at: now,
    };
    if (prev) {
      const { error } = await admin.from("fin_plan").update(row).eq("id", prev.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await admin.from("fin_plan").insert(row);
      if (error) return { error: error.message };
    }
    if (!prev || Number(prev.amount) !== amount || Number(prev.qty ?? 0) !== Number(r.qty ?? 0)) {
      log.push({ partner_id: g.partnerId, plan_type: planType, month: monthDate, kind: r.kind, category_id: row.category_id, product_id: row.product_id, qty: r.qty, amount, changed_by: g.userId });
    }
  }
  // строки, которые очистили, убираем и тоже фиксируем в истории (сумма 0)
  for (const [key, prev] of old) {
    if (wanted.has(key)) continue;
    const { error } = await admin.from("fin_plan").delete().eq("id", prev.id);
    if (error) return { error: error.message };
    log.push({ partner_id: g.partnerId, plan_type: planType, month: monthDate, kind: prev.kind, category_id: prev.category_id, product_id: prev.product_id, qty: null, amount: 0, changed_by: g.userId });
  }
  if (log.length) await admin.from("fin_plan_log").insert(log);
  if (propagate && (propagate.prices.length || propagate.expenses.length)) {
    const r = await propagateForward(g.partnerId, g.userId, monthDate, planType, propagate, okCat, okProd);
    if (r.error) return r;
  }
  revalidatePath("/finance");
  return { error: null };
}

async function propagateForward(
  partnerId: string, userId: string, monthDate: string, planType: PlanType, pr: PlanPropagation,
  okCat: Set<string>, okProd: Set<string>,
): Promise<FinResult> {
  const admin = createAdminClient();
  const cur = (c: string | null) => (c && c !== BASE_CURRENCY && CURRENCIES.some((x) => x.code === c) ? c : null);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const load = async (pt: PlanType) => {
    const out: Database["public"]["Tables"]["fin_plan"]["Row"][] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await admin.from("fin_plan").select("*").eq("partner_id", partnerId).eq("plan_type", pt).gt("month", monthDate).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  try {
    let rows = await load(planType);
    // план партнёра: месяцы, которые партнёр не правил, сейчас берутся из плана УК —
    // чтобы изменение в них попало, сначала переносим туда строки УК как строки партнёра
    if (planType === "partner") {
      const own = new Set(rows.map((r) => r.month));
      const uk = (await load("uk")).filter((r) => !own.has(r.month));
      if (uk.length) {
        const copies = uk.map((r) => ({
          partner_id: partnerId, plan_type: "partner", month: r.month, kind: r.kind, category_id: r.category_id, product_id: r.product_id,
          qty: r.qty, amount: r.amount, amount_local: r.amount_local, local_currency: r.local_currency,
        }));
        for (let i = 0; i < copies.length; i += 500) {
          const { error } = await admin.from("fin_plan").insert(copies.slice(i, i + 500));
          if (error) return { error: error.message };
        }
        rows = await load("partner");
      }
    }
    const months = [...new Set(rows.map((r) => r.month))].sort();
    const now = new Date().toISOString();
    const log: PlanLogInsert[] = [];
    for (const m of months) {
      const inMonth = rows.filter((r) => r.month === m);
      for (const p of pr.prices) {
        if (!okProd.has(p.productId)) continue;
        const row = inMonth.find((r) => r.kind === "revenue" && r.product_id === p.productId);
        const qty = Number(row?.qty ?? 0);
        if (!row || !qty) continue;
        const local = cur(p.currency) && p.unitLocal !== null ? r2(qty * p.unitLocal) : null;
        const amount = r2(qty * p.unitEur);
        const { error } = await admin.from("fin_plan").update({ amount, amount_local: local, local_currency: local === null ? null : cur(p.currency), updated_at: now }).eq("id", row.id);
        if (error) return { error: error.message };
        log.push({ partner_id: partnerId, plan_type: planType, month: m, kind: "revenue", category_id: null, product_id: p.productId, qty, amount, changed_by: userId });
      }
      for (const e of pr.expenses) {
        if (!okCat.has(e.categoryId) || (e.productId && !okProd.has(e.productId))) continue;
        const row = inMonth.find((r) => r.kind === "expense" && r.category_id === e.categoryId && (r.product_id ?? null) === (e.productId ?? null));
        const amount = r2(Number(e.amountEur));
        if (!Number.isFinite(amount) || amount < 0) continue;
        if (amount === 0) {
          if (row) {
            const { error } = await admin.from("fin_plan").delete().eq("id", row.id);
            if (error) return { error: error.message };
          }
        } else {
          const local = cur(e.currency) && e.amountLocal !== null ? r2(Number(e.amountLocal)) : null;
          const data = { amount, amount_local: local, local_currency: local === null ? null : cur(e.currency), updated_at: now };
          const { error } = row
            ? await admin.from("fin_plan").update(data).eq("id", row.id)
            : await admin.from("fin_plan").insert({ ...data, partner_id: partnerId, plan_type: planType, month: m, kind: "expense", category_id: e.categoryId, product_id: e.productId, qty: null });
          if (error) return { error: error.message };
        }
        log.push({ partner_id: partnerId, plan_type: planType, month: m, kind: "expense", category_id: e.categoryId, product_id: e.productId, qty: null, amount, changed_by: userId });
      }
    }
    for (let i = 0; i < log.length; i += 500) await admin.from("fin_plan_log").insert(log.slice(i, i + 500));
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Копирует план из одного месяца в другой (целевой месяц перезаписывается). */
export async function copyPlanMonth(from: string, to: string, planType: PlanType = "partner"): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (!planAllowed(g.role, planType)) return { error: "errNotAuthorized" };
  if (!isMonth(from) || !isMonth(to) || from === to) return { error: "finErrDate" };
  const admin = createAdminClient();
  let { data: src } = await admin.from("fin_plan").select("*").eq("partner_id", g.partnerId).eq("plan_type", planType).eq("month", `${from}-01`);
  // план партнёра за месяц, который не правили, — это план УК (см. effectivePlan)
  if (planType === "partner" && (!src || src.length === 0)) {
    ({ data: src } = await admin.from("fin_plan").select("*").eq("partner_id", g.partnerId).eq("plan_type", "uk").eq("month", `${from}-01`));
  }
  if (!src || src.length === 0) return { error: "finErrNothingToCopy" };
  const rows: PlanInput[] = src.map((r) => ({
    kind: r.kind as "revenue" | "expense", categoryId: r.category_id, productId: r.product_id,
    qty: r.qty === null ? null : Number(r.qty), amountEur: Number(r.amount),
    amountLocal: r.amount_local === null ? null : Number(r.amount_local), currency: r.local_currency,
  }));
  return savePlan(to, rows, planType);
}

// ---------------------------------------------------------------- настройки и месяцы

export async function saveOpening(formData: FormData): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const month = String(formData.get("opening_month") ?? "");
  const balance = Number(String(formData.get("opening_balance") ?? "0").replace(",", "."));
  if (!isMonth(month)) return { error: "finErrDate" };
  if (!Number.isFinite(balance)) return { error: "finErrAmount" };
  const loc = readLocal(formData, "opening_balance");
  const { error } = await createAdminClient().from("fin_settings").upsert(
    {
      partner_id: g.partnerId, opening_balance: balance, opening_balance_local: loc.local,
      local_currency: loc.currency, opening_month: `${month}-01`, updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id" }
  );
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

export async function setMonthFilled(month: string, filled: boolean): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (!isMonth(month)) return { error: "finErrDate" };
  // принятый УК месяц партнёр «разотметить» не может — сначала УК снимает «Отчёт принят»
  if (!filled && g.role !== "hq") {
    const { data: m } = await createAdminClient().from("fin_months").select("accepted").eq("partner_id", g.partnerId).eq("month", `${month}-01`).maybeSingle();
    if (m?.accepted) return { error: "finErrMonthAccepted" };
  }
  const { error } = await createAdminClient().from("fin_months").upsert(
    { partner_id: g.partnerId, month: `${month}-01`, filled, filled_at: filled ? new Date().toISOString() : null },
    { onConflict: "partner_id,month" }
  );
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

/** «Отчёт принят» — отметка головного офиса перед передачей финдиректору (только hq). */
export async function setMonthAccepted(month: string, accepted: boolean): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (g.role !== "hq") return { error: "errNotAuthorized" };
  if (!isMonth(month)) return { error: "finErrDate" };
  const profile = await getCurrentProfile();
  const { error } = await createAdminClient().from("fin_months").upsert(
    {
      partner_id: g.partnerId, month: `${month}-01`, accepted,
      accepted_at: accepted ? new Date().toISOString() : null,
      accepted_by: accepted ? g.userId : null,
      accepted_by_name: accepted ? (profile?.full_name ?? null) : null,
    },
    { onConflict: "partner_id,month" }
  );
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------- справочник статей

export async function addCategory(name: string, groupId: string, perProduct: boolean): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return { error: "finErrName" };
  const admin = createAdminClient();
  const { data: group } = await admin
    .from("fin_categories")
    .select("id, partner_id, parent_id, kind, cash_group, in_pl, auto_kind")
    .eq("id", groupId)
    .maybeSingle();
  if (!group || group.parent_id || (group.partner_id && group.partner_id !== g.partnerId)) return { error: "finErrCategory" };
  const { data: sibs } = await admin.from("fin_categories").select("sort").eq("parent_id", groupId);
  const sort = Math.max(0, ...(sibs ?? []).map((s) => s.sort)) + 1;
  const { error } = await admin.from("fin_categories").insert({
    partner_id: g.partnerId, parent_id: groupId, name: clean, kind: group.kind,
    per_product: perProduct, cash_group: group.cash_group, in_pl: group.in_pl, sort,
  });
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

export async function renameCategory(id: string, name: string): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return { error: "finErrName" };
  // меняются только свои статьи клуба; стандартные статьи сети остаются как есть
  const { error } = await createAdminClient().from("fin_categories").update({ name: clean }).eq("id", id).eq("partner_id", g.partnerId);
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}

/** Своя статья не удаляется — уходит в архив (записи в журнале остаются). */
export async function archiveCategory(id: string, archived: boolean): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  const { error } = await createAdminClient().from("fin_categories").update({ archived }).eq("id", id).eq("partner_id", g.partnerId);
  revalidatePath("/finance");
  return { error: error?.message ?? null };
}
