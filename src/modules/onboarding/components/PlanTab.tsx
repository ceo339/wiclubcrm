"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { addItem, setItemHidden, setItemStatus, updateItem } from "../actions";
import { OWNERS, type ItemStatus, type OnbStatus, type PlanItem, type TemplateWeek } from "../types";
import { Card, Chip, OWNER_KEY, OwnerChip, STATUS_KEY, StatusDot, btnCls, btnPriCls, chipBtnCls, fmtDate, inputCls } from "./ui";
import { useAct } from "./useAct";

export type PlanFilter = "all" | "do" | "open" | "hw" | "quiz";

const DO_RE = /^(Сделать|Заполнить|Сдать|Пройти|Получить|Найти)/;
const NEXT: Record<ItemStatus, ItemStatus> = { todo: "progress", progress: "done", done: "todo", moved: "todo" };

export function weekLabel(w: TemplateWeek, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (w.kind === "week") return t("onbWeekN", { n: w.num ?? "" });
  return t(w.kind === "rhythm" ? "onbWeekAfter" : "onbWeekTrainer");
}

export function isDoItem(i: Pick<PlanItem, "action">): boolean {
  return DO_RE.test(i.action);
}

export default function PlanTab({
  onboardingId,
  status,
  weeks,
  items,
  currentWeek,
  canMark,
  canManage,
  filter,
  setFilter,
}: {
  onboardingId: string;
  status: OnbStatus;
  weeks: TemplateWeek[];
  items: PlanItem[];
  currentWeek: number | null;
  canMark: boolean;
  canManage: boolean;
  filter: PlanFilter;
  setFilter: (f: PlanFilter) => void;
}) {
  const { t } = useLocale();
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const opened = status === "opened";
  const searching = filter !== "all" || !!q || !!owner;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const matches = (i: PlanItem) => {
    if (i.hidden && !(canManage && showHidden)) return false;
    if (filter === "do" && !isDoItem(i)) return false;
    if (filter === "open" && i.status === "done") return false;
    if (filter === "hw" && !i.tags.includes("ДЗ")) return false;
    if (filter === "quiz" && !i.tags.includes("квиз")) return false;
    if (owner && i.owner !== owner) return false;
    if (q && !`${i.block} ${i.title}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };

  const byWeek = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    items.forEach((i) => m.set(i.week_key, [...(m.get(i.week_key) ?? []), i]));
    return m;
  }, [items]);

  const hiddenCount = items.filter((i) => i.hidden).length;

  return (
    <div>
      {opened && (
        <Card className="mb-4 flex items-center gap-3.5 px-4 py-3.5">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-foreground font-bold text-white">✓</span>
          <div>
            <b>{t("onbArchiveTitle")}</b>
            <div className="text-[12.5px] text-muted">{t("onbArchiveHint")}</div>
          </div>
        </Card>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {(["all", "do", "open", "hw", "quiz"] as PlanFilter[]).map((f) => (
          <button key={f} type="button" className={chipBtnCls(filter === f)} onClick={() => setFilter(f)}>
            {t(`onbF_${f}`)}
          </button>
        ))}
        <select className="rounded-full border border-border bg-background px-3 py-1.5 text-[12.5px] text-ink-2" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">{t("onbAllOwners")}</option>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {t(OWNER_KEY[o])}
            </option>
          ))}
        </select>
        {canManage && hiddenCount > 0 && (
          <button type="button" className={chipBtnCls(showHidden)} onClick={() => setShowHidden(!showHidden)}>
            {t("onbShowHidden", { n: hiddenCount })}
          </button>
        )}
        <input className="ml-auto w-full rounded-full border border-border bg-background px-3.5 py-1.5 text-sm sm:w-60" placeholder={t("onbSearchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {weeks.map((w) => {
        const all = (byWeek.get(w.key) ?? []).filter((i) => !i.hidden);
        const vis = (byWeek.get(w.key) ?? []).filter(matches);
        if (!vis.length && searching) return null;
        if (!vis.length && !canManage) return null;
        const counted = all.filter((i) => i.status !== "moved");
        const done = counted.filter((i) => i.status === "done").length;
        const isNow = !opened && w.kind === "week" && w.num === currentWeek;
        const defaultClosed = opened ? !searching : w.kind !== "week" || (!searching && (w.num ?? 0) < (currentWeek ?? 1) - 1);
        const closed = toggled[w.key] ?? defaultClosed;
        return (
          <Card key={w.key} className={`mb-3 overflow-hidden ${isNow ? "outline outline-2 -outline-offset-1 outline-foreground" : ""}`}>
            <button type="button" className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left hover:bg-surface-2/40" onClick={() => setToggled({ ...toggled, [w.key]: !closed })}>
              <svg className={`shrink-0 text-muted transition ${closed ? "-rotate-90" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span className="w-[74px] shrink-0 font-display text-[13px] font-semibold text-muted">{weekLabel(w, t)}</span>
              <span className="min-w-0 font-bold">{w.title}</span>
              {isNow && <Chip tone="dark">{t("onbNow")}</Chip>}
              {w.kind === "week" && counted.length > 0 && done === counted.length && <Chip tone="line">✓ {t("onbWeekClosed")}</Chip>}
              <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12.5px] tabular-nums text-muted">
                <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-surface-3 sm:block">
                  <i className="block h-full rounded-full bg-accent" style={{ width: `${counted.length ? (done / counted.length) * 100 : 0}%` }} />
                </span>
                {done}/{counted.length}
              </span>
            </button>
            {!closed && (
              <div className="border-t border-border">
                {vis.map((i) => (
                  <ItemRow key={i.id} item={i} weeks={weeks} canMark={canMark} canManage={canManage} />
                ))}
                {canManage && <AddItem onboardingId={onboardingId} weekKey={w.key} />}
              </div>
            )}
          </Card>
        );
      })}

      <div className="mt-3.5 flex flex-wrap gap-4 text-xs text-muted">
        {(["todo", "progress", "done", "moved"] as ItemStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <StatusDot status={s} size={16} />
            {t(STATUS_KEY[s])}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-foreground px-1.5 text-[11px] font-semibold text-white">{t("onbCopy")}</span>
          {t("onbLegendCopy")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone="red">{t("onbCustom")}</Chip>
          {t("onbLegendCustom")}
        </span>
      </div>
    </div>
  );
}

function ItemRow({ item: i, weeks, canMark, canManage }: { item: PlanItem; weeks: TemplateWeek[]; canMark: boolean; canManage: boolean }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [edit, setEdit] = useState(false);
  const isDo = isDoItem(i);
  const link = i.link_mode === "copy" ? i.file_url : i.file_url ?? i.template_url;

  return (
    <div className={`border-t border-border first:border-t-0 ${i.hidden ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-[30px_minmax(0,1fr)_34px] items-center gap-3.5 px-5 py-3 hover:bg-surface-2/40 md:grid-cols-[30px_minmax(0,1fr)_150px_104px_80px_118px_34px]">
        <button
          type="button"
          disabled={!canMark || pending}
          title={t(STATUS_KEY[i.status])}
          onClick={() => run(() => setItemStatus(i.id, NEXT[i.status]))}
          className="disabled:cursor-default"
        >
          <StatusDot status={i.status} />
        </button>
        <div className="min-w-0">
          <div className={`font-semibold leading-snug ${i.status === "done" ? "text-muted" : ""}`}>{i.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {i.block && <Chip>{i.block}</Chip>}
            {i.tags.map((tag) => (
              <Chip key={tag} tone={tag === "ДЗ" ? "red" : "line"}>
                {tag}
              </Chip>
            ))}
            {i.custom && <Chip tone="red">{t("onbCustom")}</Chip>}
            {i.hidden && <Chip tone="line">{t("onbHiddenChip")}</Chip>}
            {i.doc_type && <Chip tone="line">{i.doc_type}</Chip>}
          </div>
          <div className="mt-1 text-xs text-muted md:hidden">
            {i.action} · {t(OWNER_KEY[i.owner])}
          </div>
          {error && <div className="mt-1 text-xs text-accent-strong">{t(error)}</div>}
        </div>
        <div className={`hidden text-[12.5px] md:flex md:items-start md:gap-1.5 ${isDo ? "font-semibold text-accent-strong" : "text-ink-2"}`}>
          {isDo && <i className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
          {i.action}
        </div>
        <div className="hidden md:block">
          <OwnerChip owner={i.owner} label={t(OWNER_KEY[i.owner])} />
        </div>
        <div className={`hidden text-[12.5px] tabular-nums md:block ${i.done_date ? "text-ink-2" : "text-border-strong"}`}>
          {i.done_date ? fmtDate(i.done_date) : i.status === "moved" ? t("onbStMoved") : "—"}
        </div>
        <div className="hidden flex-wrap gap-1.5 md:flex">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className={`whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-semibold ${i.link_mode === "copy" && i.file_url ? "border-foreground bg-foreground text-white" : "border-border bg-background hover:border-foreground"}`}
            >
              {i.link_mode === "copy" && i.file_url ? t("onbCopy") : t("onbOpen")} ↗
            </a>
          ) : (
            <span className="text-[12.5px] text-border-strong">{i.link_mode === "copy" ? t("onbNoCopyYet") : "—"}</span>
          )}
        </div>
        {canManage ? (
          <button type="button" onClick={() => setEdit(!edit)} className="h-[30px] w-[30px] rounded-lg text-muted hover:bg-surface-2 hover:text-foreground" aria-label={t("onbEdit")}>
            ⋯
          </button>
        ) : (
          <span />
        )}
      </div>
      {edit && canManage && <EditItem item={i} weeks={weeks} onDone={() => setEdit(false)} />}
    </div>
  );
}

function EditItem({ item: i, weeks, onDone }: { item: PlanItem; weeks: TemplateWeek[]; onDone: () => void }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  return (
    <form
      className="grid gap-3 border-t border-dashed border-border bg-surface-2/50 px-5 py-4 sm:grid-cols-2"
      action={(fd) => run(() => updateItem(i.id, fd), onDone)}
    >
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-muted">{t("onbFieldTitle")}</span>
        <input name="title" defaultValue={i.title} className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldAction")}</span>
        <input name="action" defaultValue={i.action} className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldBlock")}</span>
        <input name="block" defaultValue={i.block} className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldOwner")}</span>
        <select name="owner" defaultValue={i.owner} className={inputCls}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {t(OWNER_KEY[o])}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldWeek")}</span>
        <select name="week_key" defaultValue={i.week_key} className={inputCls}>
          {weeks.map((w) => (
            <option key={w.key} value={w.key}>
              {weekLabel(w, t)} · {w.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldFileUrl")}</span>
        <input name="file_url" defaultValue={i.file_url ?? ""} placeholder="https://" className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldTemplateUrl")}</span>
        <input name="template_url" defaultValue={i.template_url ?? ""} placeholder="https://" className={inputCls} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">{t("onbFieldDate")}</span>
        <input type="date" name="done_date" defaultValue={i.done_date ?? ""} className={inputCls} />
      </label>
      {error && <p className="text-sm text-accent-strong sm:col-span-2">{t(error)}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className={btnPriCls} disabled={pending}>
          {t("save")}
        </button>
        <button type="button" className={btnCls} disabled={pending} onClick={() => run(() => setItemStatus(i.id, i.status === "moved" ? "todo" : "moved"), onDone)}>
          {i.status === "moved" ? t("onbUnmove") : t("onbMarkMoved")}
        </button>
        <button type="button" className={`${btnCls} text-accent-strong`} disabled={pending} onClick={() => run(() => setItemHidden(i.id, !i.hidden), onDone)}>
          {i.hidden ? t("onbUnhide") : t("onbHide")}
        </button>
        <button type="button" className={btnCls} onClick={onDone}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function AddItem({ onboardingId, weekKey }: { onboardingId: string; weekKey: string }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div className="border-t border-border px-5 py-2.5">
        <button type="button" className="text-sm font-semibold text-muted hover:text-accent-strong" onClick={() => setOpen(true)}>
          ＋ {t("onbAddItem")}
        </button>
      </div>
    );
  return (
    <form className="grid gap-3 border-t border-border bg-surface-2/50 px-5 py-4 sm:grid-cols-3" action={(fd) => run(() => addItem(onboardingId, fd), () => setOpen(false))}>
      <input type="hidden" name="week_key" value={weekKey} />
      <input name="title" placeholder={t("onbFieldTitle")} className={`${inputCls} sm:col-span-3`} />
      <input name="action" placeholder={t("onbFieldAction")} className={inputCls} />
      <input name="block" placeholder={t("onbFieldBlock")} className={inputCls} />
      <select name="owner" className={inputCls} defaultValue="curator">
        {OWNERS.map((o) => (
          <option key={o} value={o}>
            {t(OWNER_KEY[o])}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-accent-strong sm:col-span-3">{t(error)}</p>}
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className={btnPriCls} disabled={pending}>
          {t("onbAdd")}
        </button>
        <button type="button" className={btnCls} onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
