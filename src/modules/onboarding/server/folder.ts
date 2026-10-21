import { createAdminClient } from "@/lib/supabase/admin";
import { onboardingWriteDb } from "./db";
import { copyFile, driveParentId, ensureFolder, folderUrl, getFile, isDriveConfigured, shareWriter } from "./drive";

/** Подпапки в папке партнера: всегда в этом порядке, даже пустые. */
export const PARTNER_SUBFOLDERS = ["01 Договор", "02 Финансы", "03 Маркетинг", "04 Продажи", "05 Залы и оборудование", "06 Школа мастеров"];

export type FolderResult = { url: string; copied: number; failed: string[]; shared: string[] } | { error: string };

/** «София · Болгария» → «София». */
function cityOnly(city: string | null): string {
  return (city ?? "").split("·")[0].trim();
}

/** «WiClub_Список_40.xlsx» → «WiClub_Батуми_Список_40». */
function copyName(original: string, city: string): string {
  const base = original.replace(/\.(docx?|xlsx?|pptx?|pdf)$/i, "").trim().replace(/^WiClub_/i, "");
  return `WiClub_${city}_${base}`;
}

/**
 * Папка партнера на общем диске: «{Город} {Имя}» в «Franch WiClub», подпапки 01–06,
 * копии файлов-шаблонов (link_mode = copy) в нужные подпапки, ссылки на копии в план,
 * доступ на редактирование партнеру. Вызывать только после проверки роли hq.
 *
 * Повторный запуск безопасен: папки находятся по имени, уже скопированные файлы
 * (у пункта плана есть file_url) не копируются заново.
 */
export async function createPartnerDriveFolder(onboardingId: string, extraShare: string[] = []): Promise<FolderResult> {
  if (!isDriveConfigured()) return { error: "onbErrDriveNotConfigured" };
  const db = onboardingWriteDb();
  const { data: onb } = await db.from("onboardings").select("id, candidate_id, city, drive_folder_url").eq("id", onboardingId).maybeSingle();
  if (!onb) return { error: "onbErrSave" };
  const { data: cand } = await createAdminClient().from("franchise_candidates").select("name, email, target_city").eq("id", onb.candidate_id).maybeSingle();
  const city = cityOnly(onb.city as string | null) || cand?.target_city || "Город";
  const rootName = `${city} ${cand?.name ?? ""}`.trim();

  try {
    // папка уже указана (например, у Софии): работаем в ней, новую не создаем
    const existingId = String(onb.drive_folder_url ?? "").match(/folders\/([\w-]+)/)?.[1];
    const root = existingId ? await getFile(existingId) : await ensureFolder(rootName, driveParentId());
    const sub = new Map<string, string>();
    for (const name of PARTNER_SUBFOLDERS) sub.set(name, (await ensureFolder(name, root.id)).id);

    // пункты плана, у которых в шаблоне есть оригинал для копии
    const { data: items } = await db
      .from("plan_items")
      .select("id, file_url, template_item_id, template_items(drive_file_id, drive_folder, link_mode)")
      .eq("onboarding_id", onboardingId)
      .not("template_item_id", "is", null);
    type Row = { id: string; file_url: string | null; template_items: { drive_file_id: string | null; drive_folder: string | null; link_mode: string } | null };
    const todo = ((items ?? []) as unknown as Row[]).filter(
      (r) => !r.file_url && r.template_items?.link_mode === "copy" && r.template_items.drive_file_id
    );

    // один оригинал копируем один раз, даже если на него ссылаются несколько пунктов
    const done = new Map<string, string>();
    const failed: string[] = [];
    for (const r of todo) {
      const t = r.template_items!;
      const fileId = t.drive_file_id!;
      try {
        let url = done.get(fileId);
        if (!url) {
          const parent = sub.get(t.drive_folder ?? "") ?? root.id;
          const src = await getFile(fileId);
          const copy = await copyFile(fileId, copyName(src.name, city), parent);
          url = copy.webViewLink;
          done.set(fileId, url);
        }
        await db.from("plan_items").update({ file_url: url, updated_at: new Date().toISOString() }).eq("id", r.id);
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }

    const url = folderUrl(root.id);
    await db.from("onboardings").update({ drive_folder_url: url, updated_at: new Date().toISOString() }).eq("id", onboardingId);

    const shared: string[] = [];
    for (const email of [...new Set([cand?.email, ...extraShare].filter((e): e is string => !!e && e.includes("@")))]) {
      try {
        await shareWriter(root.id, email.trim().toLowerCase());
        shared.push(email);
      } catch (e) {
        failed.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { url, copied: done.size, failed, shared };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "onbErrSave" };
  }
}
