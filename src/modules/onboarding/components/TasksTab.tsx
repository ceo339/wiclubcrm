"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { addTask, toggleTask } from "../actions";
import type { Meeting, Task } from "../types";
import { AssigneeChip, Card, Chip, btnCls, btnPriCls, chipBtnCls, fmtDate, inputCls, isOverdue } from "./ui";
import { useAct } from "./useAct";

type F = "all" | "partner" | "hq" | "overdue";

export default function TasksTab({
  onboardingId,
  tasks,
  meetings,
  canMark,
  canManage,
  isPartner,
}: {
  onboardingId: string;
  tasks: Task[];
  meetings: Meeting[];
  canMark: boolean;
  canManage: boolean;
  isPartner: boolean;
}) {
  const { t } = useLocale();
  const [f, setF] = useState<F>("all");
  const [adding, setAdding] = useState(false);
  const list = tasks.filter((x) => (f === "all" ? true : f === "overdue" ? isOverdue(x.due, x.done) : x.assignee_kind === f));
  const cols: [string, Task[]][] = [
    [t("onbColOpen"), list.filter((x) => !x.done && x.assignee_kind === "partner")],
    [t("onbColHq"), list.filter((x) => !x.done && x.assignee_kind === "hq")],
    [t("onbColDone"), list.filter((x) => x.done)],
  ];
  const meetingOf = (id: string | null) => meetings.find((m) => m.id === id);

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {(["all", "partner", "hq", "overdue"] as F[]).map((k) => (
          <button key={k} type="button" className={chipBtnCls(f === k)} onClick={() => setF(k)}>
            {t(`onbTF_${k}`)}
          </button>
        ))}
        {canManage && (
          <button type="button" className={`${btnPriCls} ml-auto`} onClick={() => setAdding(!adding)}>
            + {t("onbTask")}
          </button>
        )}
      </div>
      {adding && canManage && <AddTask onboardingId={onboardingId} meetings={meetings} onDone={() => setAdding(false)} />}
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(([h, l]) => (
          <div key={h}>
            <h4 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              {h} <Chip>{l.length}</Chip>
            </h4>
            {l.map((x) => (
              <TaskCard key={x.id} task={x} meeting={meetingOf(x.meeting_id)} canToggle={canMark && (!isPartner || x.assignee_kind === "partner")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task: x, meeting, canToggle }: { task: Task; meeting?: Meeting; canToggle: boolean }) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  const over = isOverdue(x.due, x.done);
  return (
    <Card className="mb-2.5 px-4 py-3.5">
      <div className="mb-2 flex items-start gap-2.5">
        <button
          type="button"
          disabled={!canToggle || pending}
          onClick={() => run(() => toggleTask(x.id, !x.done))}
          className={`relative mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.6px] disabled:cursor-default ${x.done ? "border-foreground bg-foreground" : "border-border-strong"}`}
          aria-label={t("onbToggleTask")}
        >
          {x.done && <span className="absolute left-[5px] top-[1px] h-[10px] w-[5px] rotate-45 border-b-2 border-r-2 border-white" />}
        </button>
        <div className={`font-semibold ${x.done ? "text-muted line-through" : ""}`}>{x.title}</div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <AssigneeChip kind={x.assignee_kind} label={x.assignee} />
        <span className={over ? "font-bold text-accent-strong" : ""}>
          {x.due ? t("onbDueTo", { d: fmtDate(x.due) }) : "—"}
          {over ? ` · ${t("onbOverdue")}` : ""}
        </span>
      </div>
      {meeting && (
        <div className="mt-2 border-t border-dashed border-border pt-2 text-[11.5px] text-muted">
          {t("onbFromCallDate", { d: fmtDate(meeting.held_on, true) })}
        </div>
      )}
    </Card>
  );
}

function AddTask({ onboardingId, meetings, onDone }: { onboardingId: string; meetings: Meeting[]; onDone: () => void }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  return (
    <Card className="mb-4 p-4">
      <form className="grid gap-3 sm:grid-cols-4" action={(fd) => run(() => addTask(onboardingId, fd), onDone)}>
        <input name="title" placeholder={t("onbFieldTitle")} className={`${inputCls} sm:col-span-4`} />
        <select name="assignee_kind" className={inputCls} defaultValue="partner">
          <option value="partner">{t("onbSidePartner")}</option>
          <option value="hq">{t("onbSideHq")}</option>
        </select>
        <input name="assignee" placeholder={t("onbFieldAssignee")} className={inputCls} />
        <input type="date" name="due" className={inputCls} />
        <select name="meeting_id" className={inputCls} defaultValue={meetings[0]?.id ?? ""}>
          <option value="">{t("onbNoCall")}</option>
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {fmtDate(m.held_on, true)}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-accent-strong sm:col-span-4">{t(error)}</p>}
        <div className="flex gap-2 sm:col-span-4">
          <button type="submit" className={btnPriCls} disabled={pending}>
            {t("onbAdd")}
          </button>
          <button type="button" className={btnCls} onClick={onDone}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Card>
  );
}
