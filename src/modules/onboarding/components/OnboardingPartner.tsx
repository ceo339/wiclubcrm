"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createDriveFolder, saveMilestone, saveOnboarding, setItemStatus, setOnboardingStatus } from "../actions";
import { OWNERS, progress, type OnboardingFull } from "../types";
import MeetingsTab from "./MeetingsTab";
import PlanTab, { isDoItem, type PlanFilter } from "./PlanTab";
import TasksTab from "./TasksTab";
import TemplateTab from "./TemplateTab";
import { Bar, Card, Chip, OWNER_KEY, OwnerChip, Ring, SectionTitle, StatusDot, btnCls, btnPriCls, fmtDate, inputCls } from "./ui";
import { useAct } from "./useAct";

type Tab = "plan" | "meet" | "tasks" | "rhythm" | "tpl";

export default function OnboardingPartner({
  data,
  canMark,
  canManage,
  isPartner,
  clubs,
  driveReady = false,
}: {
  data: OnboardingFull;
  canMark: boolean;
  canManage: boolean;
  isPartner: boolean;
  clubs: { id: string; name: string }[];
  driveReady?: boolean;
}) {
  const { t } = useLocale();
  const { onb, items, weeks, meetings, tasks, milestones } = data;
  const opened = onb.status === "opened";
  const [tab, setTab] = useState<Tab>(opened ? "meet" : "plan");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [newCall, setNewCall] = useState(false);
  const [settings, setSettings] = useState(false);
  const { pending, error, run } = useAct();

  const prog = progress(items);
  const openTasks = tasks.filter((x) => !x.done).length;
  const todo = items.filter((i) => /^w\d+$/.test(i.week_key) && !i.hidden && isDoItem(i) && i.status !== "done" && i.status !== "moved").length;
  const weekKeys = new Set(weeks.filter((w) => w.kind === "week").map((w) => w.key));

  const tabs: { id: Tab; label: string; n?: number | string; red?: boolean; show: boolean }[] = [
    { id: "plan", label: t(opened ? "onbTabPlanArchive" : "onbTabPlan"), n: `${prog.done}/${prog.total}`, show: true },
    { id: "meet", label: t("onbTabMeet"), n: meetings.length, show: true },
    { id: "tasks", label: t("onbTabTasks"), n: openTasks, red: openTasks > 0, show: true },
    { id: "rhythm", label: t("onbTabRhythm"), show: opened },
    { id: "tpl", label: t("onbTabTpl"), show: canManage && !!data.template },
  ];
  const order: Tab[] = opened ? ["meet", "tasks", "rhythm", "plan", "tpl"] : ["plan", "meet", "tasks", "tpl"];

  return (
    <div>
      {isPartner && !opened && <div className="mb-4 rounded-xl border border-accent-soft bg-accent-soft px-4 py-3.5 font-semibold text-accent-strong">{t("onbPartnerBanner")}</div>}

      <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
        <Card className="flex items-center gap-5 p-5 md:col-span-2 lg:col-span-1">
          <Ring pct={opened ? 100 : prog.pct} label={opened ? "✓" : undefined} />
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {onb.city && <Chip tone="line">{onb.city}</Chip>}
              {opened && <Chip tone="dark">{t("onbClubOpened")}</Chip>}
            </div>
            <h2 className="font-display text-[24px] leading-tight">{data.candidate_name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted">
              {onb.start_date && (
                <span>
                  {t("onbStarted")} <b className="text-ink-2">{fmtDate(onb.start_date, true)}</b>
                </span>
              )}
              <span>
                {opened ? (
                  <>
                    {t("onbFinished")} {onb.opened_at ? <b className="text-ink-2">{fmtDate(onb.opened_at, true)}</b> : null}
                  </>
                ) : onb.current_week ? (
                  <>
                    {t("onbWeekNow")} <b className="text-ink-2">{onb.current_week}</b> {t("onbOf10")}
                  </>
                ) : null}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted">
              {onb.curator && (
                <span>
                  {t("onbCurator")}: <b className="text-ink-2">{onb.curator}</b>
                </span>
              )}
              {onb.call_day && (
                <span>
                  {t("onbCallDay")}: <b className="text-ink-2">{onb.call_day}</b>
                </span>
              )}
              {onb.zoom_url && (
                <a href={onb.zoom_url} target="_blank" rel="noreferrer" className="font-semibold text-accent-strong underline">
                  {t("onbZoomJoin")} ↗
                </a>
              )}
              {onb.drive_folder_url && (
                <a href={onb.drive_folder_url} target="_blank" rel="noreferrer" className="font-semibold text-ink-2 underline">
                  {t("onbDriveFolder")} ↗
                </a>
              )}
            </div>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`${btnCls} !py-1 !text-xs`} onClick={() => setSettings(!settings)}>
                  {t("onbSettings")}
                </button>
                <button
                  type="button"
                  className={`${opened ? btnCls : btnPriCls} !py-1 !text-xs`}
                  disabled={pending}
                  onClick={() => {
                    if (opened || window.confirm(t("onbConfirmOpen"))) run(() => setOnboardingStatus(onb.id, opened ? "onboarding" : "opened"), () => setTab(opened ? "plan" : "meet"));
                  }}
                >
                  {t(opened ? "onbBackToOnboarding" : "onbMarkOpened")}
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-accent-strong">{t(error)}</p>}
          </div>
        </Card>

        {!opened ? (
          <Card className="p-5">
            <SectionTitle>{t("onbWhoDelivers")}</SectionTitle>
            {OWNERS.map((o) => {
              const p = progress(items.filter((i) => i.owner === o));
              return (
                <div key={o} className="mb-2.5 grid grid-cols-[96px_1fr_52px] items-center gap-2.5 text-[13px]">
                  <OwnerChip owner={o} label={t(OWNER_KEY[o])} />
                  <Bar pct={p.pct} dark={o === "curator"} />
                  <span className="text-right tabular-nums text-muted">
                    {p.done}/{p.total}
                  </span>
                </div>
              );
            })}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <div>
                <div className="text-xs text-muted">{t("onbWaitsPartner")}</div>
                <b>{t("onbDoItemsN", { n: todo })}</b>
              </div>
              <button
                type="button"
                className={`${btnCls} !py-1 !text-xs`}
                onClick={() => {
                  setFilter("do");
                  setTab("plan");
                }}
              >
                {t("onbShow")}
              </button>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <SectionTitle>{t("onbDeadlines")}</SectionTitle>
            {[
              ["onbDlRevenue", "onbBy3"],
              ["onbDlExpenses", "onbBy5"],
              ["onbDlRoyalty", "onbBy15"],
              ["onbDlMarketing", "onbBy15"],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between gap-2.5 border-t border-dashed border-border py-2 text-[13px] first:border-t-0">
                <span>{t(a)}</span>
                <b>{t(b)}</b>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <div>
                <div className="text-xs text-muted">{t("onbOpenTasks")}</div>
                <b>{openTasks}</b>
              </div>
              <button type="button" className={`${btnCls} !py-1 !text-xs`} onClick={() => setTab("tasks")}>
                {t("onbShow")}
              </button>
            </div>
          </Card>
        )}

        {!opened ? (
          <Milestones onboardingId={onb.id} milestones={milestones} canManage={canManage} nextCall={onb.next_call_at} zoomUrl={onb.zoom_url} onCall={() => { setNewCall(true); setTab("meet"); }} />
        ) : (
          <NextCallCard
            nextCall={onb.next_call_at}
            zoomUrl={onb.zoom_url}
            openTasks={openTasks}
            overdue={tasks.filter((x) => !x.done && !!x.due && x.due < new Date().toISOString().slice(0, 10)).length}
            canManage={canManage}
            onCall={() => {
              setNewCall(true);
              setTab("meet");
            }}
          />
        )}
      </div>

      {settings && canManage && <Settings data={data} clubs={clubs} driveReady={driveReady} onDone={() => setSettings(false)} />}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {order
          .map((id) => tabs.find((x) => x.id === id)!)
          .filter((x) => x.show)
          .map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === x.id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-ink-2"}`}
            >
              {x.label}
              {x.n !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] ${x.red ? "bg-accent text-white" : "bg-surface-2 text-ink-2"}`}>{x.n}</span>}
            </button>
          ))}
      </div>

      {tab === "plan" && (
        <PlanTab
          onboardingId={onb.id}
          status={onb.status}
          weeks={weeks.filter((w) => w.kind !== "rhythm" || !opened)}
          items={items}
          currentWeek={onb.current_week}
          canMark={canMark}
          canManage={canManage}
          filter={filter}
          setFilter={setFilter}
        />
      )}
      {tab === "meet" && (
        <MeetingsTab
          onboardingId={onb.id}
          status={onb.status}
          meetings={meetings}
          tasks={tasks}
          items={items.filter((i) => weekKeys.has(i.week_key))}
          weeks={weeks}
          currentWeek={onb.current_week}
          canMark={canMark}
          canManage={canManage}
          isPartner={isPartner}
          startNew={newCall}
        />
      )}
      {tab === "tasks" && <TasksTab onboardingId={onb.id} tasks={tasks} meetings={meetings} canMark={canMark} canManage={canManage} isPartner={isPartner} />}
      {tab === "rhythm" && <Rhythm data={data} canMark={canMark} />}
      {tab === "tpl" && data.template && <TemplateTab weeks={weeks} template={data.template} />}
    </div>
  );
}

function Milestones({
  onboardingId,
  milestones,
  canManage,
  nextCall,
  zoomUrl,
  onCall,
}: {
  onboardingId: string;
  milestones: OnboardingFull["milestones"];
  canManage: boolean;
  nextCall: string | null;
  zoomUrl: string | null;
  onCall: () => void;
}) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [edit, setEdit] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <SectionTitle>{t("onbMilestones")}</SectionTitle>
        {canManage && (
          <button type="button" className="text-xs font-semibold text-muted hover:text-ink-2" onClick={() => setEdit(!edit)}>
            {edit ? t("onbDoneEditing") : t("onbEdit")}
          </button>
        )}
      </div>
      {!edit ? (
        <div className="flex flex-col gap-2">
          {milestones.map((m) => {
            const done = !!m.date && m.date <= today;
            return (
              <div key={m.id} className="flex items-center gap-2.5 text-[13px]">
                <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${m.is_key ? "bg-accent" : done ? "bg-foreground" : "bg-surface-3"}`} />
                <span className="w-[54px] font-bold tabular-nums">{m.date ? fmtDate(m.date) : "—"}</span>
                <span className={m.is_key ? "font-bold" : m.date ? "" : "text-muted"}>{m.title}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {[...milestones, null].map((m, k) => (
            <form key={m?.id ?? `new${k}`} className="flex flex-wrap items-center gap-1.5" action={(fd) => run(() => saveMilestone(onboardingId, fd))}>
              <input type="hidden" name="id" value={m?.id ?? ""} />
              <input type="date" name="date" defaultValue={m?.date ?? ""} className={`${inputCls} !w-[140px] !py-1`} />
              <input name="title" defaultValue={m?.title ?? ""} placeholder={t("onbNewMilestone")} className={`${inputCls} !w-auto min-w-0 flex-1 !py-1`} />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" name="is_key" defaultChecked={m?.is_key ?? false} /> {t("onbKey")}
              </label>
              <button type="submit" className={`${btnCls} !px-2 !py-1 !text-xs`} disabled={pending}>
                {m ? t("save") : t("onbAdd")}
              </button>
            </form>
          ))}
          {error && <p className="text-sm text-accent-strong">{t(error)}</p>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <div>
          <div className="text-xs text-muted">{t("onbNextCall")}</div>
          <b>{nextCall ? new Date(nextCall).toLocaleString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</b>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {zoomUrl && (
            <a href={zoomUrl} target="_blank" rel="noreferrer" className={`${btnCls} !py-1 !text-xs`}>
              Zoom ↗
            </a>
          )}
          {canManage && (
            <button type="button" className={`${btnPriCls} !py-1 !text-xs`} onClick={onCall}>
              {t("onbStartCall")}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** После открытия: следующий созвон, Zoom и сколько задач открыто. Цифры клуба живут в CRM, не здесь. */
function NextCallCard({
  nextCall,
  zoomUrl,
  openTasks,
  overdue,
  canManage,
  onCall,
}: {
  nextCall: string | null;
  zoomUrl: string | null;
  openTasks: number;
  overdue: number;
  canManage: boolean;
  onCall: () => void;
}) {
  const { t } = useLocale();
  return (
    <Card className="flex flex-col p-5">
      <SectionTitle>{t("onbNextCall")}</SectionTitle>
      <b className="text-lg">
        {nextCall ? new Date(nextCall).toLocaleString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
      </b>
      <div className="mt-2 text-[13px] text-muted">
        {t("onbOpenTasksTotal")}: <b className="text-ink-2">{openTasks}</b>
        {overdue > 0 && <span className="font-semibold text-accent-strong"> · {t("onbOverdueN", { n: overdue })}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">{t("onbCrmNumbersHint")}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {zoomUrl && (
          <a href={zoomUrl} target="_blank" rel="noreferrer" className={`${btnCls} !py-1 !text-xs`}>
            Zoom ↗
          </a>
        )}
        {canManage && (
          <button type="button" className={`${btnPriCls} !py-1 !text-xs`} onClick={onCall}>
            + {t("onbNewCall")}
          </button>
        )}
      </div>
    </Card>
  );
}

function Rhythm({ data, canMark }: { data: OnboardingFull; canMark: boolean }) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  const list = data.items.filter((i) => i.week_key === "rhythm" && !i.hidden);
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{t("onbRhythmHint")}</p>
      <Card className="overflow-hidden">
        {list.length === 0 && <div className="px-5 py-6 text-sm text-muted">—</div>}
        {list.map((i) => {
          const link = i.file_url ?? i.template_url;
          return (
            <div key={i.id} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-border px-5 py-3.5 first:border-t-0">
              <button type="button" disabled={!canMark || pending} onClick={() => run(() => setItemStatus(i.id, i.status === "done" ? "todo" : "done"))} className="disabled:cursor-default">
                <StatusDot status={i.status} />
              </button>
              <div className="min-w-0">
                <div className="font-semibold">{i.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {i.block && <Chip>{i.block}</Chip>}
                  {i.doc_type && <Chip tone="line">{i.doc_type}</Chip>}
                </div>
              </div>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:border-foreground">
                  {t("onbOpen")} ↗
                </a>
              ) : (
                <span className="text-border-strong">—</span>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Settings({ data, clubs, driveReady, onDone }: { data: OnboardingFull; clubs: { id: string; name: string }[]; driveReady: boolean; onDone: () => void }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const o = data.onb;
  const local = o.next_call_at ? new Date(o.next_call_at) : null;
  const nextVal = local ? new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center" onClick={onDone}>
    <Card className="w-full max-w-3xl p-5 shadow-card-lg">
      <form
        onClick={(e) => e.stopPropagation()}
        className="grid gap-3 sm:grid-cols-3"
        action={(fd) => {
          const v = String(fd.get("next_call_local") ?? "");
          fd.set("next_call_at", v ? new Date(v).toISOString() : "");
          run(() => saveOnboarding(o.id, fd), onDone);
        }}
      >
        <h3 className="font-display text-lg sm:col-span-3">{t("onbSettings")}</h3>
        <F label={t("onbFieldCity")}>
          <input name="city" defaultValue={o.city ?? ""} className={inputCls} />
        </F>
        <F label={t("onbFieldClub")}>
          <select name="partner_id" defaultValue={o.partner_id ?? ""} className={inputCls}>
            <option value="">{t("onbClubNone")}</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </F>
        <F label={t("onbFieldStart")}>
          <input type="date" name="start_date" defaultValue={o.start_date ?? ""} className={inputCls} />
        </F>
        <F label={t("onbFieldCurator")}>
          <input name="curator" defaultValue={o.curator ?? ""} className={inputCls} />
        </F>
        <F label={t("onbFieldCallDay")}>
          <input name="call_day" defaultValue={o.call_day ?? ""} className={inputCls} />
        </F>
        <F label={t("onbFieldCurrentWeek")}>
          <input type="number" min={1} name="current_week" defaultValue={o.current_week ?? ""} className={inputCls} />
        </F>
        <F label={t("onbNextCall")}>
          <input type="datetime-local" name="next_call_local" defaultValue={nextVal} className={inputCls} />
        </F>
        <div className="sm:col-span-3">
          <F label={t("onbZoomUrl")}>
            <input name="zoom_url" defaultValue={o.zoom_url ?? ""} placeholder="https://zoom.us/j/..." className={inputCls} />
          </F>
        </div>
        <div className="sm:col-span-3">
          <F label={t("onbDriveFolder")}>
            <input name="drive_folder_url" defaultValue={o.drive_folder_url ?? ""} placeholder="https://drive.google.com/..." className={inputCls} />
          </F>
        </div>
        <DriveButton onboardingId={o.id} hasFolder={!!o.drive_folder_url} driveReady={driveReady} />
        {error && <p className="text-sm text-accent-strong sm:col-span-3">{t(error)}</p>}
        <div className="flex gap-2 sm:col-span-3">
          <button type="submit" className={btnPriCls} disabled={pending}>
            {t("save")}
          </button>
          <button type="button" className={btnCls} onClick={onDone}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Card>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Создать папку партнера на общем диске (подпапки 01–06, копии шаблонов, ссылки в план). */
function DriveButton({ onboardingId, hasFolder, driveReady }: { onboardingId: string; hasFolder: boolean; driveReady: boolean }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col justify-end gap-1">
      <button
        type="button"
        className={btnCls}
        disabled={!driveReady || pending}
        title={driveReady ? undefined : t("onbDriveNotReady")}
        onClick={() => {
          if (hasFolder && !window.confirm(t("onbDriveRefillConfirm"))) return;
          run(
            () => createDriveFolder(onboardingId),
            (r) => {
              const x = r as { copied?: number; failed?: string[] };
              setMsg(t("onbDriveDone", { n: x.copied ?? 0 }) + (x.failed?.length ? ` · ${t("onbDriveFailedN", { n: x.failed.length })}` : ""));
            }
          );
        }}
      >
        {pending ? "…" : hasFolder ? t("onbDriveRefill") : t("onbDriveCreate")}
      </button>
      {!driveReady && <span className="text-xs text-muted">{t("onbDriveNotReady")}</span>}
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
      {error && <span className="text-xs text-accent-strong">{t(error)}</span>}
    </div>
  );
}
