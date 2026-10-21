"use server";

import { revalidatePath } from "next/cache";
import { onboardingWriteDb } from "./server/db";
import { ownsOnboarding, requireOnboardingAccess } from "./server/guard";
import { createOnboarding } from "./server/start";
import { createPartnerDriveFolder } from "./server/folder";
import { ITEM_STATUSES, OWNERS, PARTNER_SUBFOLDERS, driveFileIdFromUrl, type ItemStatus, type Owner, type PlanItem, type TemplateItem } from "./types";

/**
 * Серверные действия модуля «Онбординг». Каждое начинается с проверки роли
 * (requireOnboardingAccess) и, где нужно, права на конкретный онбординг
 * (ownsOnboarding). Запись идет через admin-клиент только после этих проверок.
 */

export type OnbResult = { error: string | null; id?: string };

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const today = () => new Date().toISOString().slice(0, 10);
const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const asOwner = (v: string): Owner => ((OWNERS as string[]).includes(v) ? (v as Owner) : "curator");
const isUrl = (v: string | null) => !v || /^https?:\/\//i.test(v);

function refresh(id?: string) {
  revalidatePath("/onboarding");
  if (id) revalidatePath(`/onboarding/${id}`);
}

async function onboardingOfItem(table: "plan_items" | "tasks" | "milestones", id: string): Promise<string | null> {
  const { data } = await onboardingWriteDb().from(table).select("onboarding_id").eq("id", id).maybeSingle();
  return (data?.onboarding_id as string | undefined) ?? null;
}

// ------------------------------------------------------------ старт онбординга

export async function startOnboarding(fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const candidateId = str(fd, "candidate_id");
  const startDate = str(fd, "start_date") || today();
  if (!candidateId) return { error: "onbErrCandidate" };
  if (!isDate(startDate)) return { error: "onbErrDate" };

  const r = await createOnboarding({
    candidateId,
    partnerId: opt(fd, "partner_id"),
    city: opt(fd, "city"),
    startDate,
    curator: opt(fd, "curator"),
    callDay: opt(fd, "call_day"),
  });
  if ("error" in r) return { error: r.error };
  refresh(r.id);
  return { error: null, id: r.id };
}

export async function saveOnboarding(id: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const start = str(fd, "start_date");
  if (start && !isDate(start)) return { error: "onbErrDate" };
  const week = Number(str(fd, "current_week"));
  const drive = opt(fd, "drive_folder_url");
  const zoom = opt(fd, "zoom_url");
  if (!isUrl(drive) || !isUrl(zoom)) return { error: "onbErrUrl" };
  const nextCall = opt(fd, "next_call_at");
  const { error } = await onboardingWriteDb()
    .from("onboardings")
    .update({
      partner_id: opt(fd, "partner_id"),
      city: opt(fd, "city"),
      start_date: start || null,
      curator: opt(fd, "curator"),
      call_day: opt(fd, "call_day"),
      current_week: Number.isInteger(week) && week > 0 ? week : null,
      drive_folder_url: drive,
      zoom_url: zoom,
      next_call_at: nextCall,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh(id);
  return { error: null };
}

/** «Открылась»: план уходит в архив, наверх звонки и задачи. Можно вернуть обратно. */
export async function setOnboardingStatus(id: string, status: "onboarding" | "opened"): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const { error } = await onboardingWriteDb()
    .from("onboardings")
    .update({ status, opened_at: status === "opened" ? today() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh(id);
  return { error: null };
}

// ------------------------------------------------------------ пункты плана

export async function setItemStatus(itemId: string, status: ItemStatus): Promise<OnbResult> {
  const g = await requireOnboardingAccess("mark");
  if ("error" in g) return { error: g.error };
  if (!(ITEM_STATUSES as string[]).includes(status)) return { error: "onbErrSave" };
  const onbId = await onboardingOfItem("plan_items", itemId);
  if (!onbId || !(await ownsOnboarding(g.profile, onbId))) return { error: "errNotAuthorized" };
  // «перенесено» ставит только куратор
  if (status === "moved" && g.profile.role !== "hq") return { error: "errNotAuthorized" };
  const db = onboardingWriteDb();
  const { data: cur } = await db.from("plan_items").select("done_date").eq("id", itemId).single();
  const doneDate = status === "done" ? cur?.done_date ?? today() : status === "todo" ? null : cur?.done_date ?? null;
  const { error } = await db
    .from("plan_items")
    .update({ status, done_date: doneDate, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };
  refresh(onbId);
  return { error: null };
}

/** Метка «ДЗ» (домашнее задание партнеру): добавить или убрать, остальные теги не трогаем. */
function withHw(tags: string[], on: boolean): string[] {
  const rest = tags.filter((x) => x !== "ДЗ");
  return on ? [...rest, "ДЗ"] : rest;
}

export async function updateItem(itemId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const onbId = await onboardingOfItem("plan_items", itemId);
  if (!onbId) return { error: "onbErrSave" };
  const title = str(fd, "title");
  if (!title) return { error: "onbErrTitle" };
  const fileUrl = opt(fd, "file_url");
  const tplUrl = opt(fd, "template_url");
  if (!isUrl(fileUrl) || !isUrl(tplUrl)) return { error: "onbErrUrl" };
  const doneDate = str(fd, "done_date");
  if (doneDate && !isDate(doneDate)) return { error: "onbErrDate" };
  const { data: cur } = await onboardingWriteDb().from("plan_items").select("tags").eq("id", itemId).maybeSingle();
  const { error } = await onboardingWriteDb()
    .from("plan_items")
    .update({
      tags: withHw((cur?.tags as string[] | null) ?? [], fd.get("hw") === "on"),
      title,
      action: str(fd, "action"),
      block: str(fd, "block"),
      owner: asOwner(str(fd, "owner")),
      week_key: str(fd, "week_key") || undefined,
      file_url: fileUrl,
      template_url: tplUrl,
      done_date: doneDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) return { error: error.message };
  refresh(onbId);
  return { error: null };
}

export async function setItemHidden(itemId: string, hidden: boolean): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const onbId = await onboardingOfItem("plan_items", itemId);
  if (!onbId) return { error: "onbErrSave" };
  const { error } = await onboardingWriteDb().from("plan_items").update({ hidden }).eq("id", itemId);
  if (error) return { error: error.message };
  refresh(onbId);
  return { error: null };
}

export async function addItem(onboardingId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const title = str(fd, "title");
  const weekKey = str(fd, "week_key");
  if (!title) return { error: "onbErrTitle" };
  if (!weekKey) return { error: "onbErrSave" };
  const db = onboardingWriteDb();
  const { data: last } = await db
    .from("plan_items")
    .select("sort")
    .eq("onboarding_id", onboardingId)
    .eq("week_key", weekKey)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db.from("plan_items").insert({
    onboarding_id: onboardingId,
    week_key: weekKey,
    block: str(fd, "block"),
    title,
    action: str(fd, "action"),
    owner: asOwner(str(fd, "owner")),
    link_mode: "none",
    file_url: opt(fd, "file_url"),
    custom: true,
    sort: ((last?.sort as number | undefined) ?? 0) + 1,
  });
  if (error) return { error: error.message };
  refresh(onboardingId);
  return { error: null };
}

// ------------------------------------------------------------ вехи

export async function saveMilestone(onboardingId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const id = str(fd, "id");
  const title = str(fd, "title");
  const date = str(fd, "date");
  if (!title) return { error: "onbErrTitle" };
  if (date && !isDate(date)) return { error: "onbErrDate" };
  const row = { title, date: date || null, is_key: fd.get("is_key") === "on" };
  const db = onboardingWriteDb();
  const { error } = id
    ? await db.from("milestones").update(row).eq("id", id).eq("onboarding_id", onboardingId)
    : await db.from("milestones").insert({ ...row, onboarding_id: onboardingId, sort: 5 });
  if (error) return { error: error.message };
  refresh(onboardingId);
  return { error: null };
}

// ------------------------------------------------------------ звонки и задачи

/**
 * Созвон: дата, заметки (необязательно) и задачи (что, кто, дедлайн).
 * Неделя только пока идет онбординг; после открытия клуба просто дата.
 */
type TaskInput = { title: string; assignee: string; kind: "partner" | "hq"; due: string };

function parseTasks(raw: string): TaskInput[] | null {
  try {
    const arr = JSON.parse(raw || "[]") as Partial<TaskInput>[];
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) => ({
        title: String(x.title ?? "").trim(),
        assignee: String(x.assignee ?? "").trim(),
        kind: x.kind === "hq" ? ("hq" as const) : ("partner" as const),
        due: String(x.due ?? "").trim(),
      }))
      .filter((x) => x.title);
  } catch {
    return null;
  }
}

export async function addMeeting(onboardingId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const heldOn = str(fd, "held_on") || today();
  if (!isDate(heldOn)) return { error: "onbErrDate" };
  const week = Number(str(fd, "week"));
  const tasks = parseTasks(str(fd, "tasks_json"));
  if (!tasks) return { error: "onbErrSave" };
  if (tasks.some((x) => x.due && !isDate(x.due))) return { error: "onbErrDate" };
  const notes = lines(str(fd, "notes"));
  if (!tasks.length && !notes.length) return { error: "onbErrEmptyCall" };

  const db = onboardingWriteDb();
  const { data, error } = await db
    .from("meetings")
    .insert({
      onboarding_id: onboardingId,
      held_on: heldOn,
      week: Number.isInteger(week) && week > 0 ? week : null,
      notes,
      created_by: g.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "onbErrSave" };

  if (tasks.length) {
    const { error: e2 } = await db.from("tasks").insert(
      tasks.map((x) => ({
        onboarding_id: onboardingId,
        meeting_id: data.id,
        title: x.title,
        assignee: x.assignee || (x.kind === "hq" ? "Куратор" : "Партнёр"),
        assignee_kind: x.kind,
        due: x.due || null,
      }))
    );
    if (e2) return { error: e2.message };
  }
  refresh(onboardingId);
  return { error: null, id: data.id };
}

/** Правка задачи (hq): название, кто, сторона, дедлайн. */
export async function updateTask(taskId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const title = str(fd, "title");
  const due = str(fd, "due");
  if (!title) return { error: "onbErrTitle" };
  if (due && !isDate(due)) return { error: "onbErrDate" };
  const kind = str(fd, "assignee_kind") === "hq" ? "hq" : "partner";
  const db = onboardingWriteDb();
  const onbId = await onboardingOfItem("tasks", taskId);
  if (!onbId) return { error: "onbErrSave" };
  const { error } = await db
    .from("tasks")
    .update({ title, assignee: str(fd, "assignee") || (kind === "hq" ? "Куратор" : "Партнёр"), assignee_kind: kind, due: due || null })
    .eq("id", taskId);
  if (error) return { error: error.message };
  refresh(onbId);
  return { error: null };
}

export async function addTask(onboardingId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const title = str(fd, "title");
  const due = str(fd, "due");
  if (!title) return { error: "onbErrTitle" };
  if (due && !isDate(due)) return { error: "onbErrDate" };
  const kind = str(fd, "assignee_kind") === "hq" ? "hq" : "partner";
  const { error } = await onboardingWriteDb()
    .from("tasks")
    .insert({
      onboarding_id: onboardingId,
      meeting_id: opt(fd, "meeting_id"),
      title,
      assignee: str(fd, "assignee") || (kind === "hq" ? "Куратор" : "Партнёр"),
      assignee_kind: kind,
      due: due || null,
    });
  if (error) return { error: error.message };
  refresh(onboardingId);
  return { error: null };
}

/** Отметить задачу: hq любую, партнер только задачи на стороне партнера в своем онбординге. */
export async function toggleTask(taskId: string, done: boolean): Promise<OnbResult> {
  const g = await requireOnboardingAccess("mark");
  if ("error" in g) return { error: g.error };
  const db = onboardingWriteDb();
  const { data: task } = await db.from("tasks").select("onboarding_id, assignee_kind").eq("id", taskId).maybeSingle();
  if (!task || !(await ownsOnboarding(g.profile, task.onboarding_id as string))) return { error: "errNotAuthorized" };
  if (g.profile.role !== "hq" && task.assignee_kind !== "partner") return { error: "errNotAuthorized" };
  const { error } = await db.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };
  refresh(task.onboarding_id as string);
  return { error: null };
}

// ------------------------------------------------------------ шаблон УК

export async function updateTemplateItem(itemId: string, fd: FormData): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const title = str(fd, "title");
  if (!title) return { error: "onbErrTitle" };
  const url = opt(fd, "template_url");
  if (!isUrl(url)) return { error: "onbErrUrl" };
  const mode = str(fd, "link_mode");
  const db = onboardingWriteDb();
  const { data: cur } = await db.from("template_items").select("*").eq("id", itemId).maybeSingle();
  if (!cur) return { error: "onbErrSave" };
  const old = cur as TemplateItem;
  const next = {
    title,
    action: str(fd, "action"),
    block: str(fd, "block"),
    owner: asOwner(str(fd, "owner")),
    week_key: str(fd, "week_key") || old.week_key,
    template_url: url,
    tags: withHw(old.tags ?? [], fd.get("hw") === "on"),
  };
  const { error } = await db
    .from("template_items")
    .update({
      ...next,
      link_mode: mode === "copy" || mode === "none" ? mode : "template",
      drive_file_id: driveFileIdFromUrl(url),
      drive_folder: PARTNER_SUBFOLDERS.includes(str(fd, "drive_folder")) ? str(fd, "drive_folder") : null,
    })
    .eq("id", itemId);
  if (error) return { error: error.message };
  if (fd.get("sync") === "on") await syncTemplateToPlans(itemId, old, next);
  revalidatePath("/onboarding", "layout");
  return { error: null };
}

/**
 * Правка шаблона в планы идущих онбордингов: только в несделанных пунктах
 * и только те поля, которые у партнера совпадают со старым шаблоном
 * (то, что куратор поменяла у конкретного партнера, не перетираем).
 */
async function syncTemplateToPlans(
  templateItemId: string,
  old: TemplateItem,
  next: Pick<TemplateItem, "title" | "action" | "block" | "owner" | "week_key" | "template_url" | "tags">
) {
  const db = onboardingWriteDb();
  const { data: active } = await db.from("onboardings").select("id").eq("status", "onboarding");
  const ids = (active ?? []).map((o) => o.id as string);
  if (!ids.length) return;
  const { data: rows } = await db
    .from("plan_items")
    .select("id, title, action, block, owner, week_key, template_url, tags, status")
    .eq("template_item_id", templateItemId)
    .in("onboarding_id", ids)
    .neq("status", "done");
  const oldHw = (old.tags ?? []).includes("ДЗ");
  const newHw = next.tags.includes("ДЗ");
  for (const r of (rows ?? []) as Pick<PlanItem, "id" | "title" | "action" | "block" | "owner" | "week_key" | "template_url" | "tags">[]) {
    const patch: Record<string, unknown> = {};
    for (const f of ["title", "action", "block", "owner", "week_key"] as const) {
      if (r[f] === old[f] && old[f] !== next[f]) patch[f] = next[f];
    }
    if ((r.template_url ?? null) === (old.template_url ?? null) && old.template_url !== next.template_url) patch.template_url = next.template_url;
    if (oldHw !== newHw && (r.tags ?? []).includes("ДЗ") === oldHw) patch.tags = withHw(r.tags ?? [], newHw);
    if (Object.keys(patch).length) await db.from("plan_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
  }
}

/**
 * Ссылка на оригинал из шаблона в планы партнеров, у которых этот пункт
 * еще без ссылки (свои ссылки партнеров не трогаем).
 */
export async function pushTemplateLinks(): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const db = onboardingWriteDb();
  const { data: tpl } = await db.from("template_items").select("id, template_url").not("template_url", "is", null);
  for (const t of (tpl ?? []) as Pick<TemplateItem, "id" | "template_url">[]) {
    await db.from("plan_items").update({ template_url: t.template_url }).eq("template_item_id", t.id).is("template_url", null);
  }
  refresh();
  return { error: null };
}

// ------------------------------------------------------------ Google Диск и перенос пунктов

/** «Создать папку на Диске»: подпапки 01–06, копии шаблонов, ссылки в план, доступ партнеру. */
export async function createDriveFolder(onboardingId: string): Promise<OnbResult & { url?: string; copied?: number; failed?: string[] }> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const r = await createPartnerDriveFolder(onboardingId);
  if ("error" in r) return { error: r.error };
  refresh(onboardingId);
  return { error: null, url: r.url, copied: r.copied, failed: r.failed };
}

/** Перетаскивание пункта плана в другую неделю (только hq). Встает в конец недели. */
export async function moveItem(itemId: string, weekKey: string): Promise<OnbResult> {
  const g = await requireOnboardingAccess("manage");
  if ("error" in g) return { error: g.error };
  const db = onboardingWriteDb();
  const { data: wk } = await db.from("template_weeks").select("key").eq("key", weekKey).maybeSingle();
  if (!wk) return { error: "onbErrSave" };
  const onbId = await onboardingOfItem("plan_items", itemId);
  if (!onbId) return { error: "onbErrSave" };
  const { data: last } = await db
    .from("plan_items")
    .select("sort")
    .eq("onboarding_id", onbId)
    .eq("week_key", weekKey)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db
    .from("plan_items")
    .update({ week_key: weekKey, sort: ((last?.sort as number | undefined) ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };
  refresh(onbId);
  return { error: null };
}
