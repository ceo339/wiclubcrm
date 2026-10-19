"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, type Profile } from "@/lib/auth";
import { getViewScopePartnerId } from "@/lib/viewScope";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_CURRENCY, CURRENCIES } from "@/lib/currency";
import { readLocal } from "@/lib/server/localMoney";
import type { Database } from "@/types/database";

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

async function guard(): Promise<{ partnerId: string; userId: string } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const partnerId = await manageablePartnerId(profile);
  if (!partnerId) return { error: "errNotAuthorized" };
  return { partnerId, userId: profile.id };
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

export async function savePlan(month: string, rows: PlanInput[]): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (!isMonth(month)) return { error: "finErrDate" };
  const monthDate = `${month}-01`;
  const admin = createAdminClient();

  const [{ data: cats }, { data: prods }, { data: existing }] = await Promise.all([
    admin.from("fin_categories").select("id, partner_id, parent_id, auto_kind").or(`partner_id.is.null,partner_id.eq.${g.partnerId}`),
    admin.from("products").select("id").eq("partner_id", g.partnerId),
    admin.from("fin_plan").select("*").eq("partner_id", g.partnerId).eq("month", monthDate),
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
      partner_id: g.partnerId, month: monthDate, kind: r.kind,
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
      log.push({ partner_id: g.partnerId, month: monthDate, kind: r.kind, category_id: row.category_id, product_id: row.product_id, qty: r.qty, amount, changed_by: g.userId });
    }
  }
  // строки, которые очистили, убираем и тоже фиксируем в истории (сумма 0)
  for (const [key, prev] of old) {
    if (wanted.has(key)) continue;
    const { error } = await admin.from("fin_plan").delete().eq("id", prev.id);
    if (error) return { error: error.message };
    log.push({ partner_id: g.partnerId, month: monthDate, kind: prev.kind, category_id: prev.category_id, product_id: prev.product_id, qty: null, amount: 0, changed_by: g.userId });
  }
  if (log.length) await admin.from("fin_plan_log").insert(log);
  revalidatePath("/finance");
  return { error: null };
}

/** Копирует план из одного месяца в другой (целевой месяц перезаписывается). */
export async function copyPlanMonth(from: string, to: string): Promise<FinResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (!isMonth(from) || !isMonth(to) || from === to) return { error: "finErrDate" };
  const admin = createAdminClient();
  const { data: src } = await admin.from("fin_plan").select("*").eq("partner_id", g.partnerId).eq("month", `${from}-01`);
  if (!src || src.length === 0) return { error: "finErrNothingToCopy" };
  const rows: PlanInput[] = src.map((r) => ({
    kind: r.kind as "revenue" | "expense", categoryId: r.category_id, productId: r.product_id,
    qty: r.qty === null ? null : Number(r.qty), amountEur: Number(r.amount),
    amountLocal: r.amount_local === null ? null : Number(r.amount_local), currency: r.local_currency,
  }));
  return savePlan(to, rows);
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
  const { error } = await createAdminClient().from("fin_months").upsert(
    { partner_id: g.partnerId, month: `${month}-01`, filled, filled_at: filled ? new Date().toISOString() : null },
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
