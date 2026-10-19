import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/auth";
import { canManageOnboarding } from "../access";
import { onboardingReadDb } from "./db";
import {
  progress,
  type Meeting,
  type Milestone,
  type Onboarding,
  type OnboardingCard,
  type OnboardingFull,
  type PlanItem,
  type StartableCandidate,
  type Task,
  type TemplateItem,
  type TemplateWeek,
} from "../types";

/** Стадии воронки, с которых можно начинать онбординг: договор отправлен и дальше. */
const STARTABLE_STAGES = ["contract_sent", "contract_signed", "invoiced", "invoice_paid", "training", "active"];

/** Имена кандидатов: читаем только по id онбордингов, которые пользователь уже видит через RLS. */
async function candidateNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await createAdminClient().from("franchise_candidates").select("id, name").in("id", ids);
  (data ?? []).forEach((c) => map.set(c.id, c.name ?? "—"));
  return map;
}

export async function loadOverview(): Promise<OnboardingCard[]> {
  const db = await onboardingReadDb();
  const { data: onbs, error } = await db.from("onboardings").select("*").order("created_at");
  if (error) throw new Error(error.message);
  const list = (onbs ?? []) as Onboarding[];
  if (!list.length) return [];
  const ids = list.map((o) => o.id);
  const [{ data: items }, { data: tasks }, { data: meetings }, names] = await Promise.all([
    db.from("plan_items").select("onboarding_id, week_key, hidden, status").in("onboarding_id", ids),
    db.from("tasks").select("onboarding_id, done").in("onboarding_id", ids),
    db.from("meetings").select("onboarding_id, held_on").in("onboarding_id", ids),
    candidateNames(list.map((o) => o.candidate_id)),
  ]);
  return list.map((o) => {
    const mine = ((items ?? []) as Pick<PlanItem, "onboarding_id" | "week_key" | "hidden" | "status">[]).filter((i) => i.onboarding_id === o.id);
    const p = progress(mine);
    const last = ((meetings ?? []) as Pick<Meeting, "onboarding_id" | "held_on">[])
      .filter((m) => m.onboarding_id === o.id)
      .map((m) => m.held_on)
      .sort()
      .pop();
    return {
      ...o,
      candidate_name: names.get(o.candidate_id) ?? "—",
      done: p.done,
      total: p.total,
      open_tasks: ((tasks ?? []) as Pick<Task, "onboarding_id" | "done">[]).filter((t) => t.onboarding_id === o.id && !t.done).length,
      last_meeting: last ?? null,
    };
  });
}

export async function loadOnboarding(id: string, profile: Profile): Promise<OnboardingFull | null> {
  const db = await onboardingReadDb();
  const { data: onb } = await db.from("onboardings").select("*").eq("id", id).maybeSingle();
  if (!onb) return null;
  const manage = canManageOnboarding(profile.role);
  const [weeks, items, milestones, meetings, tasks, template, names] = await Promise.all([
    db.from("template_weeks").select("*").order("sort"),
    db.from("plan_items").select("*").eq("onboarding_id", id).order("sort"),
    db.from("milestones").select("*").eq("onboarding_id", id).order("sort"),
    db.from("meetings").select("*").eq("onboarding_id", id).order("held_on", { ascending: false }),
    db.from("tasks").select("*").eq("onboarding_id", id).order("created_at"),
    manage ? db.from("template_items").select("*").eq("archived", false).order("sort") : Promise.resolve({ data: null }),
    candidateNames([(onb as Onboarding).candidate_id]),
  ]);
  return {
    onb: onb as Onboarding,
    candidate_name: names.get((onb as Onboarding).candidate_id) ?? "—",
    weeks: (weeks.data ?? []) as TemplateWeek[],
    items: (items.data ?? []) as PlanItem[],
    milestones: (milestones.data ?? []) as Milestone[],
    meetings: (meetings.data ?? []) as Meeting[],
    tasks: (tasks.data ?? []) as Task[],
    template: (template.data as TemplateItem[] | null) ?? null,
  };
}

/** Онбординг партнера по его клубу (партнер попадает сразу на свою страницу). */
export async function onboardingIdForPartner(partnerId: string): Promise<string | null> {
  const db = await onboardingReadDb();
  const { data } = await db.from("onboardings").select("id").eq("partner_id", partnerId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Кандидаты для кнопки «Начать онбординг» (только hq): дошли до договора и еще без онбординга. */
export async function loadStartableCandidates(existing: string[]): Promise<StartableCandidate[]> {
  const { data } = await createAdminClient()
    .from("franchise_candidates")
    .select("id, name, target_city, stage")
    .in("stage", STARTABLE_STAGES)
    .order("name");
  return (data ?? [])
    .filter((c) => !existing.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name ?? "—", city: c.target_city ?? null }));
}

export async function loadClubs(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient().from("partners").select("id, name").order("name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
}
