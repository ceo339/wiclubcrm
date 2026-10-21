"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { pushTemplateLinks, updateTemplateItem } from "../actions";
import { OWNERS, PARTNER_SUBFOLDERS, type TemplateItem, type TemplateWeek } from "../types";
import { weekLabel } from "./PlanTab";
import { Card, Chip, OWNER_KEY, btnCls, btnPriCls, inputCls } from "./ui";
import { useAct } from "./useAct";

/** Эталонный план УК. Правки шаблона не меняют уже начатые планы партнеров. */
export default function TemplateTab({ weeks, template }: { weeks: TemplateWeek[]; template: TemplateItem[] }) {
  const { t } = useLocale();
  const { pending, run } = useAct();
  const [open, setOpen] = useState<string | null>(null);
  const copies = template.filter((i) => i.link_mode === "copy");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <b className="font-display text-lg">{t("onbTemplateTitle")}</b>
          <button type="button" className={btnCls} disabled={pending} onClick={() => run(() => pushTemplateLinks())}>
            {t("onbPushLinks")}
          </button>
        </div>
        {weeks.map((w) => {
          const list = template.filter((i) => i.week_key === w.key);
          const isOpen = open === w.key;
          return (
            <div key={w.key} className="border-t border-border first:border-t-0">
              <button type="button" className="flex w-full justify-between px-4 py-3 text-left hover:bg-surface-2/50" onClick={() => setOpen(isOpen ? null : w.key)}>
                <span>
                  <b>{weekLabel(w, t)}</b> · {w.title}
                </span>
                <span className="text-sm text-muted">{t("onbNItems", { n: list.length })}</span>
              </button>
              {isOpen && list.map((i) => <TplRow key={i.id} item={i} weeks={weeks} />)}
            </div>
          );
        })}
      </Card>
      <div className="space-y-4">
        <Card className="border-foreground bg-foreground p-5 text-white">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/70">{t("onbTplHowTitle")}</h4>
          <p className="mb-2.5 text-sm text-white/90">{t("onbTplHow1")}</p>
          <p className="mb-2.5 text-sm text-white/90">{t("onbTplHow2")}</p>
          <p className="text-sm text-white/90">{t("onbTplHow3")}</p>
        </Card>
        <Card className="p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{t("onbTplCopiesTitle")}</h4>
          <p className="mb-2.5 text-[13px] text-muted">{t("onbTplCopiesHint")}</p>
          {copies.map((i) => (
            <div key={i.id} className="flex justify-between gap-2 border-t border-dashed border-border py-2 text-[13px] first:border-t-0">
              <span>{i.title}</span>
              {i.doc_type && <Chip>{i.doc_type}</Chip>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function TplRow({ item: i, weeks }: { item: TemplateItem; weeks: TemplateWeek[] }) {
  const { t } = useLocale();
  const { pending, error, run } = useAct();
  const [edit, setEdit] = useState(false);
  return (
    <div className="border-t border-dashed border-border px-4 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{i.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {i.block && <Chip>{i.block}</Chip>}
            <Chip tone="line">{t(OWNER_KEY[i.owner])}</Chip>
            <Chip tone={i.link_mode === "copy" ? "dark" : "line"}>{t(`onbLink_${i.link_mode}`)}</Chip>
            {i.tags.includes("ДЗ") && <Chip tone="red">ДЗ</Chip>}
            {i.template_url ? (
              <a href={i.template_url} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">
                {t("onbOpen")} ↗
              </a>
            ) : (
              <span className="text-xs text-accent-strong">{t("onbNoLink")}</span>
            )}
          </div>
        </div>
        <button type="button" className="rounded-lg px-2 text-muted hover:bg-surface-2" onClick={() => setEdit(!edit)} aria-label={t("onbEdit")}>
          ⋯
        </button>
      </div>
      {edit && (
        <form className="mt-3 grid gap-2.5 sm:grid-cols-2" action={(fd) => run(() => updateTemplateItem(i.id, fd), () => setEdit(false))}>
          <input name="title" defaultValue={i.title} className={`${inputCls} sm:col-span-2`} />
          <input name="action" defaultValue={i.action} placeholder={t("onbFieldAction")} className={inputCls} />
          <input name="block" defaultValue={i.block} placeholder={t("onbFieldBlock")} className={inputCls} />
          <select name="owner" defaultValue={i.owner} className={inputCls}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {t(OWNER_KEY[o])}
              </option>
            ))}
          </select>
          <select name="link_mode" defaultValue={i.link_mode} className={inputCls}>
            {(["template", "copy", "none"] as const).map((m) => (
              <option key={m} value={m}>
                {t(`onbLink_${m}`)}
              </option>
            ))}
          </select>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("onbFieldWeek")}</span>
            <select name="week_key" defaultValue={i.week_key} className={inputCls}>
              {weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  {weekLabel(w, t)} · {w.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="hw" defaultChecked={i.tags.includes("ДЗ")} className="h-4 w-4" />
            <span>{t("onbHwLabel")}</span>
          </label>
          <label className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm sm:col-span-2">
            <input type="checkbox" name="sync" defaultChecked className="mt-0.5 h-4 w-4" />
            <span>{t("onbTplSync")}</span>
          </label>
          <input name="template_url" defaultValue={i.template_url ?? ""} placeholder={t("onbFieldTemplateUrl")} className={`${inputCls} sm:col-span-2`} />
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("onbFieldDriveFolder")}</span>
            <select name="drive_folder" defaultValue={i.drive_folder ?? ""} className={inputCls}>
              <option value="">{t("onbDriveFolderRoot")}</option>
              {PARTNER_SUBFOLDERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted sm:col-span-2">{t("onbCopyHint")}</p>
          {error && <p className="text-sm text-accent-strong sm:col-span-2">{t(error)}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={btnPriCls} disabled={pending}>
              {t("save")}
            </button>
            <button type="button" className={btnCls} onClick={() => setEdit(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
