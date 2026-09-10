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
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}
