"use server";

// Server actions for the home page itself (as opposed to a specific
// feature's own actions.ts) — currently just checking off a task from the
// "Мои задачи" widget, which can point at either a lead's or a member's
// task, so it doesn't belong to either feature's own actions file.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = { error: string | null };

export async function setHomeTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("entity_type").eq("id", taskId).maybeSingle();
  if (!task) return { error: "errGeneric" };

  // Franchise-candidate tasks have no partner_id — they belong to HQ / МПП
  // (same rule as setCandidateTaskDone and the tasks_update RLS policy).
  // Before this fix the home widget rejected them for any account without
  // a club (i.e. HQ), the checkbox only hid the task locally and it came
  // back on reload.
  if (task.entity_type === "franchise_candidate") {
    if (!(profile.role === "hq" || profile.franchise_access === "edit")) return { error: "errNotAuthorized" };
  } else if (!profile.partner_id) {
    return { error: "errHqNoClubGeneric" };
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ done })
    .eq("id", taskId)
    .select("id");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "errNotAuthorized" };

  revalidatePath("/");
  revalidatePath("/franchise");
  return { error: null };
}
