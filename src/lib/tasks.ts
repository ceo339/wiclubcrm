// The "Мои задачи" widget on the home page — real reminders a partner (or
// HQ, read-only) typed onto a lead's or member's card, surfaced in one
// place instead of only inside that card. Nothing here is inferred or
// scored: a task shows up because someone asked to be reminded, on the
// date they chose (or with no date at all, if they didn't set one).

export type OpenTask = {
  id: string;
  text: string;
  dueDate: string | null;
  /** "franchise_candidate" added round 44 ("Добавь задачи в карточку лида
   * [франчайзи] и на главную") — a task on a franchise candidate's card,
   * shown on the franchise-scope Главная instead of a club's own task list. */
  entityType: "lead" | "member" | "franchise_candidate";
  entityId: string;
  entityName: string;
  /** Only set on the HQ (network-wide) view — a partner's own list is all
   * their own club, so naming it on every row would be noise. Always null
   * for a franchise-candidate task (no club owns it). */
  partnerName: string | null;
};

export type TaskUrgency = "overdue" | "today" | "upcoming" | "noDate";

export function taskUrgency(dueDate: string | null, today: string): TaskUrgency {
  if (!dueDate) return "noDate";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

/**
 * Overdue first (most overdue first), then due today, then upcoming by
 * date — tasks with no due date last, but never dropped: "remind me" with
 * no date is still a real task someone asked for, just not a race against
 * the calendar.
 */
export function sortOpenTasks(tasks: OpenTask[]): OpenTask[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/** Where clicking this task's row should take you — the deep-link query
 * param that LeadsBoard/MembersBoard/FranchiseBoard read to auto-open the
 * right card. */
export function taskHref(task: OpenTask): string {
  if (task.entityType === "lead") return `/leads?open=${task.entityId}`;
  if (task.entityType === "member") return `/members?open=${task.entityId}`;
  return `/franchise?open=${task.entityId}`;
}
