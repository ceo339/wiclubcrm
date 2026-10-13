"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setHomeTaskDone } from "@/app/actions";
import { formatDateRu } from "@/lib/dashboard";
import { franchiseStageLabel } from "@/lib/franchise";
import { taskUrgency, type OpenTask } from "@/lib/tasks";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * «Задачи по кандидаткам» on the franchise Главная — same card as
 * «Недавняя активность» next to it (Anastasiia, 13 Oct 2026: «сделай левую
 * колонку такую же как правую … симметрично больше полей»): header with a
 * subtitle, full-width rows, and per row the candidate's name, the task, her
 * stage and city, and the due date on the right. Checking the box closes the
 * task (setHomeTaskDone, same as the old TasksWidget).
 */
export default function FranchiseTasksCard({ tasks, canEdit }: { tasks: OpenTask[]; canEdit: boolean }) {
  const { locale, t } = useLocale();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function handleToggle(taskId: string) {
    setDoneIds((prev) => new Set(prev).add(taskId));
    startTransition(async () => {
      const res = await setHomeTaskDone(taskId, true);
      if (res.error) {
        setDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        window.alert(t(res.error));
      }
    });
  }

  const visible = tasks.filter((task) => !doneIds.has(task.id));

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-background shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{t("headingFranchiseTasks")}</h3>
        <p className="text-xs text-muted">
          {t("subheadingFranchiseTasks", { n: visible.length })}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t("emptyNoOpenTasks")}</p>
      ) : (
        <div className="max-h-[30rem] divide-y divide-border overflow-y-auto">
          {visible.map((task) => {
            const urgency = taskUrgency(task.dueDate, today);
            const isUrgent = urgency === "overdue" || urgency === "today";
            return (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                {canEdit ? (
                  <input
                    type="checkbox"
                    disabled={isPending}
                    onChange={() => handleToggle(task.id)}
                    aria-label={t("taskMarkDone")}
                    className="h-4 w-4 shrink-0"
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
                )}
                <Link href={`/franchise?open=${task.entityId}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{task.entityName}</div>
                  <div className="truncate text-sm text-ink-2">{task.text}</div>
                  {(task.stage || task.city) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {task.stage && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
                          {franchiseStageLabel(task.stage, locale)}
                        </span>
                      )}
                      {task.city && <span className="truncate text-xs text-muted">· {task.city}</span>}
                    </div>
                  )}
                </Link>
                <div className={`shrink-0 text-xs ${isUrgent ? "font-medium text-accent-strong" : "text-muted"}`}>
                  {task.dueDate ? formatDateRu(task.dueDate) : t("taskNoDueDate")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
