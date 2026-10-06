import type { Db } from "@/lib/server/leadEnrollment";

// Round 58 — tasks the DSK payment webhook creates for the club, and the one
// that clears itself. Plain helpers, not a "use server" file: they are called
// from the webhook (service_role client) and from inside other server actions.

export const CHOOSE_COHORT_PREFIX = "Выбрать поток:";

export function chooseCohortTaskText(personName: string, courseName: string): string {
  return `${CHOOSE_COHORT_PREFIX} ${personName} — ${courseName}`;
}

/** Adds an open task unless the very same one is already open on that card
 * (a repeated bank notification must not stack up copies). */
export async function addTaskOnce(
  db: Db,
  task: { partnerId: string; entityType: "lead" | "member"; entityId: string; text: string; dueDate: string | null }
): Promise<void> {
  const { data: open } = await db
    .from("tasks")
    .select("id")
    .eq("entity_type", task.entityType)
    .eq("entity_id", task.entityId)
    .eq("text", task.text)
    .eq("done", false)
    .limit(1);
  if (open && open.length > 0) return;
  await db.from("tasks").insert({
    partner_id: task.partnerId,
    entity_type: task.entityType,
    entity_id: task.entityId,
    text: task.text,
    due_date: task.dueDate,
  });
}

/**
 * «Когда партнёр выбирает поток — пометка и задача снимаются сами»: once an
 * enrolment of this member in this course gets a поток, the open
 * «Выбрать поток: <имя> — <курс>» task on her card is ticked off. The badge
 * needs no clean-up — it is computed from «course has потоки, start date empty».
 */
export async function closeChooseCohortTasks(db: Db, memberId: string, courseName: string | null): Promise<void> {
  if (!courseName) return;
  const { data: open } = await db
    .from("tasks")
    .select("id, text")
    .eq("entity_type", "member")
    .eq("entity_id", memberId)
    .eq("done", false)
    .like("text", `${CHOOSE_COHORT_PREFIX}%`);
  const ids = (open ?? []).filter((t) => t.text.endsWith(` — ${courseName}`)).map((t) => t.id);
  if (ids.length > 0) await db.from("tasks").update({ done: true }).in("id", ids);
}
