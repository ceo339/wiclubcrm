import { onboardingWriteDb } from "./db";
import type { TemplateItem } from "../types";

/**
 * Создание онбординга: строка onboardings + план (копия шаблона УК) + стартовые вехи.
 * Вызывается только из серверного кода после проверки роли hq:
 * кнопка «Начать онбординг» (actions.ts) и «+ Клуб» (через api.ts).
 *
 * Если у кандидата онбординг уже есть, но без клуба, и передан partnerId,
 * просто привязывает клуб (второй онбординг не создаем).
 */
export async function createOnboarding(input: {
  candidateId: string;
  partnerId?: string | null;
  city?: string | null;
  startDate: string;
  curator?: string | null;
  callDay?: string | null;
}): Promise<{ id: string; linked: boolean } | { error: string }> {
  const db = onboardingWriteDb();

  const { data: existing } = await db.from("onboardings").select("id, partner_id").eq("candidate_id", input.candidateId).maybeSingle();
  if (existing) {
    if (input.partnerId && !existing.partner_id) {
      const { error } = await db.from("onboardings").update({ partner_id: input.partnerId, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) return { error: error.message };
      return { id: existing.id as string, linked: true };
    }
    return { error: "onbErrExists" };
  }

  const { data: onb, error } = await db
    .from("onboardings")
    .insert({
      candidate_id: input.candidateId,
      partner_id: input.partnerId ?? null,
      city: input.city ?? null,
      start_date: input.startDate,
      curator: input.curator ?? null,
      call_day: input.callDay ?? null,
      current_week: 1,
    })
    .select("id")
    .single();
  if (error || !onb) return { error: error?.code === "23505" ? "onbErrExists" : error?.message ?? "onbErrSave" };

  // план партнера = копия шаблона УК; правки партнера шаблон не меняют
  const { data: tpl } = await db.from("template_items").select("*").eq("archived", false).order("sort");
  const rows = ((tpl ?? []) as TemplateItem[]).map((t) => ({
    onboarding_id: onb.id,
    template_item_id: t.id,
    week_key: t.week_key,
    block: t.block,
    title: t.title,
    action: t.action,
    doc_type: t.doc_type,
    owner: t.owner,
    tags: t.tags,
    link_mode: t.link_mode,
    template_url: t.template_url,
    sort: t.sort,
  }));
  if (rows.length) {
    const { error: e2 } = await db.from("plan_items").insert(rows);
    if (e2) return { error: e2.message };
  }
  await db.from("milestones").insert([
    { onboarding_id: onb.id, date: input.startDate, title: "Старт онбординга", sort: 0 },
    { onboarding_id: onb.id, date: null, title: "День рождения WiClub", is_key: true, sort: 1 },
    { onboarding_id: onb.id, date: null, title: "Письменный допуск к открытию", sort: 9 },
  ]);
  return { id: onb.id as string, linked: false };
}
