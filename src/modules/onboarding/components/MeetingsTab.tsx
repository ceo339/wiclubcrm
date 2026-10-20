"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { addMeeting, addTask, setItemStatus, toggleTask, updateTask } from "../actions";
import type { AssigneeKind, Meeting, OnbStatus, PlanItem, Task, TemplateWeek } from "../types";
import { AssigneeChip, Card, OWNER_KEY, StatusDot, btnCls, btnPriCls, fmtDate, inputCls, isOverdue } from "./ui";
import { useAct } from "./useAct";

/**
 * Созвоны и задачи. Созвон = дата + задачи (что, кто, дедлайн) + заметки по желанию.
 * Неделя онбординга только пока клуб не открылся.
 */
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
  const opened = status === "opened";
  const [sel, setSel] = useState<string | "new">(startNew && canManage ? "new" : meetings[0]?.id ?? (canManage ? "new" : ""));
  const m = meetings.find((x) => x.id === sel);
  const names = [...new Set(tasks.map((x) => x.assignee).filter(Boolean))];

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="self-start overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <b>{t("onbCallsList")}</b>
          {canManage && (
            <button type="button" className={`${btnPriCls} !px-2.5 !py-1 !text-[12.5px]`} onClick={() => setSel("new")}>
              + {t("onbNewCall")}
            </button>
          )}
        </div>
        {meetings.length === 0 && <div className="px-4 py-6 text-sm text-muted">{t("onbNoCallsYet")}</div>}
        {meetings.map((x) => {
          const mine = tasks.filter((tk) => tk.meeting_id === x.id);
          const open = mine.filter((tk) => !tk.done);
          const over = open.filter((tk) => isOverdue(tk.due, tk.done)).length;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setSel(x.id)}
              className={`block w-full border-t border-border px-4 py-3 text-left first-of-type:border-t-0 ${sel === x.id ? "bg-surface-2" : "hover:bg-surface-2/50"}`}
            >
              <b className="block">
                {fmtDate(x.held_on, true)}
                {!opened && x.week ? <span className="font-normal text-muted"> · {t("onbWeekN", { n: x.week })}</span> : null}
              </b>
              <span className="text-[12.5px] text-muted">
                {t("onbOpenTasksN", { n: open.length })}
                {over > 0 && <span className="font-semibold text-accent-strong"> · {t("onbOverdueN", { n: over })}</span>}
              </span>
            </button>
          );
        })}
      </Card>

      <Card className="p-6">
        {sel === "new" && canManage ? (
          <NewCall onboardingId={onboardingId} opened={opened} currentWeek={currentWeek} names={names} onDone={(id) => setSel(id ?? meetings[0]?.id ?? "")} />
        ) : m ? (
          <CallDetail
            onboardingId={onboardingId}
            m={m}
            opened={opened}
            tasks={tasks.filter((tk) => tk.meeting_id === m.id)}
            agenda={!opened ? agendaFor(m, items, weeks) : []}
            names={names}
            canMark={canMark}
            canManage={canManage}
            isPartner={isPartner}
          />
        ) : (
          <p className="text-sm text-muted">{t("onbNoCallsYet")}</p>
        )}
      </Card>
    </div>
  );
}

/** Повестка (только в онбординге): незакрытые пункты плана до недели созвона. */
function agendaFor(m: Meeting, items: PlanItem[], weeks: TemplateWeek[]): PlanItem[] {
  const upTo = Math.min(m.week ?? 10, 10);
  const keys = new Set(weeks.filter((w) => w.kind === "week" && (w.num ?? 0) <= upTo).map((w) => w.key));
  return items.filter((i) => keys.has(i.week_key) && !i.hidden && i.status !== "done" && i.status !== "moved").slice(0, 8);
}

function CallDetail({
  onboardingId,
  m,
  opened,
  tasks,
  agenda,
  names,
  canMark,
  canManage,
  isPartner,
}: {
  onboardingId: string;
  m: Meeting;
  opened: boolean;
  tasks: Task[];
  agenda: PlanItem[];
  names: string[];
  canMark: boolean;
  canManage: boolean;
  isPartner: boolean;
}) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  const [adding, setAdding] = useState(false);
  const notes = [...m.done_items.map((d) => `✓ ${d}`), ...m.notes];
  return (
    <div>
      <h3 className="font-display text-[22px]">{t("onbCallOn", { d: fmtDate(m.held_on, true) })}</h3>
      {!opened && m.week ? <div className="text-sm text-muted">{t("onbWeekN", { n: m.week })}</div> : null}

      <Sec title={t("onbTabTasks")}>
        {tasks.length === 0 && <p className="text-sm text-muted">—</p>}
        {tasks.map((tk) => (
          <TaskLine key={tk.id} task={tk} names={names} canToggle={canMark && (!isPartner || tk.assignee_kind === "partner")} canEdit={canManage} />
        ))}
        {canManage &&
          (adding ? (
            <QuickTask onboardingId={onboardingId} meetingId={m.id} names={names} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className="mt-2 text-sm font-semibold text-muted hover:text-accent-strong" onClick={() => setAdding(true)}>
              ＋ {t("onbAddTaskRow")}
            </button>
          ))}
      </Sec>

      {notes.length > 0 && (
        <Sec title={t("onbNotes")}>
          {notes.map((d, k) => (
            <div key={k} className="mb-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
              {d}
            </div>
          ))}
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
    </div>
  );
}

export function TaskLine({ task: tk, names, canToggle, canEdit }: { task: Task; names: string[]; canToggle: boolean; canEdit: boolean }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [edit, setEdit] = useState(false);
  const over = isOverdue(tk.due, tk.done);
  if (edit)
    return (
      <form className="grid gap-2 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[1fr_150px_130px_auto]" action={(fd) => run(() => updateTask(tk.id, fd), () => setEdit(false))}>
        <input name="title" defaultValue={tk.title} className={inputCls} />
        <WhoInput names={names} defaultWho={tk.assignee} defaultKind={tk.assignee_kind} />
        <input type="date" name="due" defaultValue={tk.due ?? ""} className={inputCls} />
        <div className="flex gap-1.5">
          <button type="submit" className={`${btnPriCls} !py-1 !text-xs`} disabled={pending}>
            {t("save")}
          </button>
          <button type="button" className={`${btnCls} !py-1 !text-xs`} onClick={() => setEdit(false)}>
            ×
          </button>
        </div>
        {error && <p className="text-xs text-accent-strong sm:col-span-4">{t(error)}</p>}
      </form>
    );
  return (
    <div className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t border-border py-2.5 text-[13.5px] first:border-t-0 sm:grid-cols-[22px_1fr_150px_96px_28px]">
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
      {canEdit ? (
        <button type="button" className="hidden h-7 w-7 rounded-lg text-muted hover:bg-surface-2 hover:text-foreground sm:block" onClick={() => setEdit(true)} aria-label={t("onbEdit")}>
          ⋯
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
    </div>
  );
}

/** «Кто»: имя (подсказки из прошлых задач) + сторона: партнер или команда УК. */
function WhoInput({ names, defaultWho = "", defaultKind = "partner", onKind }: { names: string[]; defaultWho?: string; defaultKind?: AssigneeKind; onKind?: (k: AssigneeKind) => void }) {
  const { t } = useLocale();
  return (
    <div className="flex gap-1.5">
      <input name="assignee" defaultValue={defaultWho} list="onb-assignees" placeholder={t("onbTaskWho")} className={`${inputCls} min-w-0`} />
      <select name="assignee_kind" defaultValue={defaultKind} onChange={(e) => onKind?.(e.target.value as AssigneeKind)} className={`${inputCls} !w-auto`} title={t("onbTaskWho")}>
        <option value="partner">{t("onbSidePartnerShort")}</option>
        <option value="hq">{t("onbSideHqShort")}</option>
      </select>
      <datalist id="onb-assignees">
        {["Партнёр", "Куратор", ...names].filter((v, i, a) => a.indexOf(v) === i).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}

function QuickTask({ onboardingId, meetingId, names, onDone }: { onboardingId: string; meetingId: string; names: string[]; onDone: () => void }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  return (
    <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_190px_130px_auto]" action={(fd) => run(() => addTask(onboardingId, fd), onDone)}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input name="title" placeholder={t("onbTaskWhat")} className={inputCls} autoFocus />
      <WhoInput names={names} />
      <input type="date" name="due" className={inputCls} />
      <div className="flex gap-1.5">
        <button type="submit" className={`${btnPriCls} !py-1 !text-xs`} disabled={pending}>
          {t("onbAdd")}
        </button>
        <button type="button" className={`${btnCls} !py-1 !text-xs`} onClick={onDone}>
          ×
        </button>
      </div>
      {error && <p className="text-xs text-accent-strong sm:col-span-4">{t(error)}</p>}
    </form>
  );
}

type Row = { title: string; assignee: string; kind: AssigneeKind; due: string };
const emptyRow = (): Row => ({ title: "", assignee: "", kind: "partner", due: "" });

function NewCall({
  onboardingId,
  opened,
  currentWeek,
  names,
  onDone,
}: {
  onboardingId: string;
  opened: boolean;
  currentWeek: number | null;
  names: string[];
  onDone: (id?: string) => void;
}) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const set = (k: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === k ? { ...r, ...patch } : r)));

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        fd.set("tasks_json", JSON.stringify(rows.filter((r) => r.title.trim())));
        run(() => addMeeting(onboardingId, fd), (r) => onDone(r.id));
      }}
    >
      <h3 className="font-display text-[22px]">{t("onbNewCall")}</h3>
      <div className="flex flex-wrap gap-3">
        <label className="w-44">
          <span className="mb-1 block text-xs text-muted">{t("onbFieldDate")}</span>
          <input type="date" name="held_on" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
        </label>
        {!opened && (
          <label className="w-36">
            <span className="mb-1 block text-xs text-muted">{t("onbWeekOptional")}</span>
            <input type="number" name="week" min={1} defaultValue={currentWeek ?? ""} className={inputCls} />
          </label>
        )}
      </div>

      <div>
        <div className="mb-1.5 hidden grid-cols-[1fr_190px_130px] gap-2 text-xs text-muted sm:grid">
          <span>{t("onbTaskWhat")}</span>
          <span>{t("onbTaskWho")}</span>
          <span>{t("onbTaskDeadline")}</span>
        </div>
        <div className="space-y-2">
          {rows.map((r, k) => (
            <div key={k} className="grid gap-2 rounded-lg border border-dashed border-border p-2 sm:grid-cols-[1fr_190px_130px] sm:border-0 sm:p-0">
              <input value={r.title} onChange={(e) => set(k, { title: e.target.value })} placeholder={t("onbTaskWhat")} className={inputCls} />
              <div className="flex gap-1.5">
                <input value={r.assignee} onChange={(e) => set(k, { assignee: e.target.value })} list="onb-assignees-new" placeholder={t("onbTaskWho")} className={`${inputCls} min-w-0`} />
                <select value={r.kind} onChange={(e) => set(k, { kind: e.target.value as AssigneeKind })} className={`${inputCls} !w-auto`}>
                  <option value="partner">{t("onbSidePartnerShort")}</option>
                  <option value="hq">{t("onbSideHqShort")}</option>
                </select>
              </div>
              <input type="date" value={r.due} onChange={(e) => set(k, { due: e.target.value })} className={inputCls} />
            </div>
          ))}
        </div>
        <datalist id="onb-assignees-new">
          {["Партнёр", "Куратор", ...names].filter((v, i, a) => a.indexOf(v) === i).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="button" className="mt-2 text-sm font-semibold text-muted hover:text-accent-strong" onClick={() => setRows([...rows, emptyRow()])}>
          ＋ {t("onbAddTaskRow")}
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">{t("onbNotesOptional")}</span>
        <textarea name="notes" rows={3} className={inputCls} />
        <span className="mt-1 block text-xs text-muted">{t("onbLinesHint")}</span>
      </label>

      {error && <p className="text-sm text-accent-strong">{t(error)}</p>}
      <div className="flex gap-2">
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

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h5>
      {children}
    </div>
  );
}
