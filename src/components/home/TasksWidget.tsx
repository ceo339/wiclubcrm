"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setHomeTaskDone } from "@/app/actions";
import { formatDateRu } from "@/lib/dashboard";
import { taskHref, taskUrgency, type OpenTask } from "@/lib/tasks";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * The one place a partner (or HQ, read-only, across every club) sees every
 * open task at once, instead of hunting through each lead/member card.
 * Checking a box calls the real setHomeTaskDone action — same "tasks"
 * table the lead/member cards already write to, nothing separate to keep
 * in sync.
 */
export default function TasksWidget({
  tasks,
  headingKey,
  canEdit,
}: {
  tasks: OpenTask[];
  headingKey: string;
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function handleToggle(taskId: string) {
    setDoneIds((prev) => new Set(prev).add(taskId));
    startTransition(async () => {
      await setHomeTaskDone(taskId, true);
    });
  }

  const visible = tasks.filter((task) => !doneIds.has(task.id));

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-card">
      <div className="text-sm font-medium text-foreground">{t(headingKey)}</div>
      {visible.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("emptyNoOpenTasks")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {visible.map((task) => {
            const urgency = taskUrgency(task.dueDate, today);
            const isUrgent = urgency === "overdue" || urgency === "today";
            return (
              <li
                key={task.id}
                className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-xs"
              >
                {canEdit ? (
                  <input
                    type="checkbox"
                    disabled={isPending}
                    onChange={() => handleToggle(task.id)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                ) : (
                  <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                )}
                <Link href={taskHref(task)} className="min-w-0 flex-1 hover:underline">
                  <div className="truncate font-medium text-foreground">{task.entityName}</div>
                  <div className="truncate text-muted">{task.text}</div>
                  {task.partnerName && <div className="truncate text-muted">{task.partnerName}</div>}
                </Link>
                <span className={`shrink-0 font-medium ${isUrgent ? "text-accent-strong" : "text-muted"}`}>
                  {task.dueDate ? formatDateRu(task.dueDate) : t("taskNoDueDate")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
