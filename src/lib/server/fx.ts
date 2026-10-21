import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Round 94 — «иначе отчёты будут плавать»: курс EUR→USD Европейского ЦБ на
 * каждую дату (fx_eur_usd). Триггеры в БД по нему фиксируют amount_usd у
 * оплат, взносов по пакетам, расходов и плана — сумма в $ на дату оплаты,
 * которая потом не меняется. Раз в день догружаем курсы за последние ~2 месяца
 * и пересчитываем $ у оплат/расходов за этот период — оплата, внесённая до
 * публикации курса своего дня, на следующий день получает именно его.
 * Источник: frankfurter.dev (данные ЕЦБ); если он недоступен — сегодняшний
 * курс open.er-api как временный (заменяется курсом ЕЦБ при следующем запуске).
 * Вызывается из ежедневного крона /api/cron/franchise-invoices и вручную /api/cron/fx.
 */
export async function syncFxRates(admin: SupabaseClient<Database>): Promise<{ ok: boolean; source: string; rates: number; from: string; error?: string }> {
  const fromDate = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const rows: { day: string; rate: number; source: string; updated_at: string }[] = [];
  const now = new Date().toISOString();
  let source = "ecb";

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${fromDate}..?base=EUR&symbols=USD`, { cache: "no-store" });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, { USD?: number }> };
    for (const [day, r] of Object.entries(data.rates ?? {})) {
      if (r?.USD && r.USD > 0) rows.push({ day, rate: r.USD, source: "ecb", updated_at: now });
    }
    if (rows.length === 0) throw new Error("frankfurter: no rates");
  } catch {
    source = "er-api";
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/EUR", { cache: "no-store" });
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      const usd = data.rates?.USD;
      if (data.result === "success" && usd && usd > 0) {
        const today = now.slice(0, 10);
        const { data: existing } = await admin.from("fx_eur_usd").select("source").eq("day", today).maybeSingle();
        if (!existing || existing.source !== "ecb") rows.push({ day: today, rate: usd, source: "er-api", updated_at: now });
      }
    } catch {
      return { ok: false, source, rates: 0, from: fromDate, error: "no rate source reachable" };
    }
  }

  if (rows.length > 0) {
    const { error } = await admin.from("fx_eur_usd").upsert(rows, { onConflict: "day" });
    if (error) return { ok: false, source, rates: 0, from: fromDate, error: error.message };
  }
  const { error: recalcError } = await admin.rpc("fx_recompute_usd", { from_day: fromDate });
  if (recalcError) return { ok: false, source, rates: rows.length, from: fromDate, error: recalcError.message };
  return { ok: true, source, rates: rows.length, from: fromDate };
}
