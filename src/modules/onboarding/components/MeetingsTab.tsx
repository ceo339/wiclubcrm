"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { addMeeting, setItemStatus, toggleTask } from "../actions";
import type { Meeting, OnbStatus, PlanItem, Task, TemplateWeek } from "../types";
import { AssigneeChip, Card, OWNER_KEY, StatusDot, btnCls, btnPriCls, fmtDate, inputCls, isOverdue } from "./ui";
import { useAct } from "./useAct";

export default function MeetingsTab({
  onboardingId,
  status,
  meetings,
  tasks,
  items,
  weeks,
  currentWeek,
  canMark,
  canManage,
  isPartner,
  startNew,
}: {
  onboardingId: string;
  status: OnbStatus;
  meetings: Meeting[];
  tasks: Task[];
  items: PlanItem[];
  weeks: TemplateWeek[];
  currentWeek: number | null;
  canMark: boolean;
  canManage: boolean;
  isPartner: boolean;
  startNew: boolean;
}) {
  const { t } = useLocale();
  const [sel, setSel] = useState<string | "new">(startNew && canManage ? "new" : meetings[0]?.id ?? (canManage ? "new" : ""));
  const m = meetings.find((x) => x.id === sel);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="self-start overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <b>{t("onbCalls")}</b>
          {canManage && (
            <button type="button" className={`${btnPriCls} !px-2.5 !py-1 !text-[12.5px]`} onClick={() => setSel("new")}>
              + {t("onbProtocol")}
            </button>
          )}
        </div>
        {meetings.length === 0 && <div className="px-4 py-6 text-sm text-muted">{t("onbNoCalls")}</div>}
        {meetings.map((x) => {
          const open = tasks.filter((tk) => tk.meeting_id === x.id && !tk.done).length;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setSel(x.id)}
              className={`block w-full border-t border-border px-4 py-3.5 text-left first-of-type:border-t-0 ${sel === x.id ? "bg-surface-2" : "hover:bg-surface-2/50"}`}
            >
              <b className="block">
                {x.week ? `${t("onbWeekN", { n: x.week })} · ` : ""}
                {fmtDate(x.held_on, true)}
              </b>
              <span className="text-[12.5px] text-muted">
                {t("onbOpenTasksN", { n: open })}
                {x.participants ? ` · ${x.participants}` : ""}
              </span>
            </button>
          );
        })}
      </Card>

      <Card className="p-6">
        {sel === "new" && canManage ? (
          <NewMeeting onboardingId={onboardingId} currentWeek={currentWeek} onDone={(id) => setSel(id ?? meetings[0]?.id ?? "")} />
        ) : m ? (
          <MeetingDetail
            m={m}
            tasks={tasks.filter((tk) => tk.meeting_id === m.id)}
            agenda={status === "onboarding" ? agendaFor(m, items, weeks) : []}
            canMark={canMark}
            isPartner={isPartner}
          />
        ) : (
          <p className="text-sm text-muted">{t("onbNoCalls")}</p>
        )}
      </Card>
    </div>
  );
}

/** Повестка: незакрытые пункты плана до недели звонка включительно. */
function agendaFor(m: Meeting, items: PlanItem[], weeks: TemplateWeek[]): PlanItem[] {
  const upTo = Math.min(m.week ?? 10, 10);
  const keys = new Set(weeks.filter((w) => w.kind === "week" && (w.num ?? 0) <= upTo).map((w) => w.key));
  return items.filter((i) => keys.has(i.week_key) && !i.hidden && i.status !== "done" && i.status !== "moved").slice(0, 8);
}

function MeetingDetail({ m, tasks, agenda, canMark, isPartner }: { m: Meeting; tasks: Task[]; agenda: PlanItem[]; canMark: boolean; isPartner: boolean }) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  return (
    <div>
      <h3 className="font-display text-[22px]">{m.week ? t("onbCallWeek", { n: m.week }) : t("onbCall")}</h3>
      <div className="text-sm text-muted">
        {fmtDate(m.held_on, true)}
        {m.participants ? ` · ${t("onbParticipants")}: ${m.participants}` : ""}
      </div>

      {m.numbers.length > 0 && (
        <Sec title={t("onbWeekNumbers")}>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {m.numbers.map((n, k) => (
              <div key={k} className="rounded-xl border border-border bg-background px-3.5 py-3">
                <span className="text-xs text-muted">{n.label}</span>
                <b className="block font-display text-[22px]">{n.value}</b>
                {n.note && <span className="text-xs text-muted">{n.note}</span>}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {agenda.length > 0 && (
        <Sec title={t("onbAgenda")}>
          <div className="rounded-xl border border-border px-3.5 py-1">
            {agenda.map((i) => (
              <div key={i.id} className="flex items-start gap-2.5 border-t border-dashed border-border py-2 first:border-t-0">
                <StatusDot status={i.status} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{i.title}</div>
                  <div className="text-xs text-muted">
                    {i.action} · {t(OWNER_KEY[i.owner])}
                  </div>
                </div>
                {canMark && (
                  <button type="button" className={`${btnCls} !px-2.5 !py-1 !text-xs`} disabled={pending} onClick={() => run(() => setItemStatus(i.id, "done"))}>
                    {t("onbMarkDone")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{t("onbAgendaHint")}</p>
        </Sec>
      )}

      {m.done_items.length > 0 && (
        <Sec title={t("onbDoneOnCall")}>
          {m.done_items.map((d, k) => (
            <div key={k} className="mb-2 rounded-xl bg-surface-2 px-3.5 py-3">
              ✓ {d}
            </div>
          ))}
        </Sec>
      )}

      {m.notes.length > 0 && (
        <Sec title={t("onbNotes")}>
          {m.notes.map((d, k) => (
            <div key={k} className="mb-2 rounded-xl bg-surface-2 px-3.5 py-3">
              {d}
            </div>
          ))}
        </Sec>
      )}

      <Sec title={t("onbCallTasks")}>
        {tasks.length === 0 && <p className="text-sm text-muted">—</p>}
        {tasks.map((tk) => (
          <TaskLine key={tk.id} task={tk} canToggle={canMark && (!isPartner || tk.assignee_kind === "partner")} />
        ))}
      </Sec>
    </div>
  );
}

export function TaskLine({ task: tk, canToggle }: { task: Task; canToggle: boolean }) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  const over = isOverdue(tk.due, tk.done);
  return (
    <div className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t border-border py-2.5 text-[13.5px] first:border-t-0 sm:grid-cols-[22px_1fr_140px_100px]">
      <button
        type="button"
        disabled={!canToggle || pending}
        onClick={() => run(() => toggleTask(tk.id, !tk.done))}
        className={`relative h-[18px] w-[18px] rounded-[5px] border-[1.6px] disabled:cursor-default ${tk.done ? "border-foreground bg-foreground" : "border-border-strong"}`}
        aria-label={t("onbToggleTask")}
      >
        {tk.done && <span className="absolute left-[5px] top-[1px] h-[10px] w-[5px] rotate-45 border-b-2 border-r-2 border-white" />}
      </button>
      <span className={tk.done ? "text-muted line-through" : ""}>{tk.title}</span>
      <span className="hidden sm:block">
        <AssigneeChip kind={tk.assignee_kind} label={tk.assignee} />
      </span>
      <span className={`text-right text-[12.5px] tabular-nums ${over ? "font-bold text-accent-strong" : "text-ink-2"}`}>{tk.due ? t("onbDueTo", { d: fmtDate(tk.due) }) : "—"}</span>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h5 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h5>
      {children}
    </div>
  );
}

function NewMeeting({ onboardingId, currentWeek, onDone }: { onboardingId: string; currentWeek: number | null; onDone: (id?: string) => void }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  return (
    <form className="grid gap-3 sm:grid-cols-3" action={(fd) => run(() => addMeeting(onboardingId, fd), (r) => onDone(r.id))}>
      <h3 className="font-display text-[22px] sm:col-span-3">{t("onbNewProtocol")}</h3>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldDate")}</span>
        <input type="date" name="held_on" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldWeek")}</span>
        <input type="number" name="week" min={1} defaultValue={currentWeek ?? ""} className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbParticipants")}</span>
        <input name="participants" className={inputCls} />
      </label>
      <Area name="numbers" label={t("onbWeekNumbers")} hint={t("onbNumbersHint")} />
      <Area name="done_items" label={t("onbDoneOnCall")} hint={t("onbLinesHint")} />
      <Area name="notes" label={t("onbNotes")} hint={t("onbLinesHint")} />
      <Area name="tasks" label={t("onbCallTasks")} hint={t("onbTasksHint")} />
      {error && <p className="text-sm text-accent-strong sm:col-span-3">{t(error)}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className={btnPriCls} disabled={pending}>
          {t("save")}
        </button>
        <button type="button" className={btnCls} onClick={() => onDone()}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function Area({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label className="sm:col-span-3">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <textarea name={name} rows={3} className={inputCls} />
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </label>
  );
}
