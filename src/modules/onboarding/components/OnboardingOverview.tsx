"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { startOnboarding } from "../actions";
import type { OnboardingCard, StartableCandidate } from "../types";
import { Bar, Card, Chip, btnCls, btnPriCls, chipBtnCls, fmtDate, inputCls } from "./ui";

type Filter = "onboarding" | "opened" | "all";

export default function OnboardingOverview({
  cards,
  canManage,
  candidates,
  clubs,
}: {
  cards: OnboardingCard[];
  canManage: boolean;
  candidates: StartableCandidate[];
  clubs: { id: string; name: string }[];
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<Filter>("onboarding");
  const [startOpen, setStartOpen] = useState(false);
  const shown = cards.filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["onboarding", "opened", "all"] as Filter[]).map((f) => (
          <button key={f} type="button" className={chipBtnCls(filter === f)} onClick={() => setFilter(f)}>
            {t(f === "onboarding" ? "onbFilterActive" : f === "opened" ? "onbFilterOpened" : "onbFilterAll")}
            <span className="ml-1.5 opacity-60">{f === "all" ? cards.length : cards.filter((c) => c.status === f).length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {shown.map((c) => {
          const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
          return (
            <Link key={c.id} href={`/onboarding/${c.id}`} className="block">
              <Card className="h-full p-5 transition hover:-translate-y-px hover:shadow-card-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-[22px] font-semibold leading-tight">{c.city ?? "—"}</div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {c.candidate_name}
                      {c.start_date ? ` · ${t("onbStartShort")} ${fmtDate(c.start_date, true)}` : ""}
                    </div>
                  </div>
                  {c.status === "opened" ? (
                    <Chip tone="line">✓ {t("onbOpenedChip")}</Chip>
                  ) : c.current_week ? (
                    <Chip tone="dark">{t("onbWeekN", { n: c.current_week })}</Chip>
                  ) : null}
                </div>
                {c.status === "onboarding" && (
                  <>
                    <Bar pct={pct} className="mt-4" />
                    <div className="mt-2 flex justify-between text-[12.5px] text-ink-2">
                      <span>{t("onbPlanDonePct", { p: pct })}</span>
                      <span>{t("onbXofY", { x: c.done, y: c.total })}</span>
                    </div>
                  </>
                )}
                <div className="mt-2 flex justify-between text-[12.5px]">
                  <span className="text-muted">{t("onbOpenTasks")}</span>
                  <b className={c.open_tasks ? "text-accent-strong" : ""}>{c.open_tasks}</b>
                </div>
                <div className="mt-1 flex justify-between text-[12.5px]">
                  <span className="text-muted">{t("onbLastCall")}</span>
                  <b>{fmtDate(c.last_meeting)}</b>
                </div>
              </Card>
            </Link>
          );
        })}

        {shown.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted">{t(filter === "opened" ? "onbEmptyOpened" : "onbEmpty")}</Card>
        )}

        {canManage && filter !== "opened" && !startOpen && (
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            className="grid min-h-[180px] place-items-center rounded-xl border-[1.5px] border-dashed border-border-strong p-5 text-center font-semibold text-muted hover:border-foreground hover:text-ink-2"
          >
            <span>
              ＋ {t("onbStartNew")}
              <br />
              <span className="text-[12.5px] font-medium">{t("onbStartNewHint")}</span>
            </span>
          </button>
        )}
      </div>

      {canManage && startOpen && <StartForm candidates={candidates} clubs={clubs} onClose={() => setStartOpen(false)} />}
    </div>
  );
}

function StartForm({ candidates, clubs, onClose }: { candidates: StartableCandidate[]; clubs: { id: string; name: string }[]; onClose: () => void }) {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [cand, setCand] = useState(candidates[0]?.id ?? "");
  const city = candidates.find((c) => c.id === cand)?.city ?? "";

  return (
    <Card className="max-w-2xl p-5">
      <h3 className="font-display text-lg">{t("onbStartNew")}</h3>
      <p className="mb-4 text-sm text-muted">{t("onbStartFormHint")}</p>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">{t("onbNoCandidates")}</p>
      ) : (
        <form
          key={cand}
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) =>
            start(async () => {
              const r = await startOnboarding(fd);
              if (r.error) setErr(r.error);
              else router.push(`/onboarding/${r.id}`);
            })
          }
        >
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("onbFieldCandidate")}</span>
            <select name="candidate_id" className={inputCls} value={cand} onChange={(e) => setCand(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? ` · ${c.city}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("onbFieldCity")}</span>
            <input name="city" className={inputCls} defaultValue={city} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("onbFieldClub")}</span>
            <select name="partner_id" className={inputCls} defaultValue="">
              <option value="">{t("onbClubNone")}</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("onbFieldStart")}</span>
            <input type="date" name="start_date" className={inputCls} defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("onbFieldCurator")}</span>
            <input name="curator" className={inputCls} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("onbFieldCallDay")}</span>
            <input name="call_day" className={inputCls} placeholder={t("onbCallDayPh")} />
          </label>
          {err && <p className="text-sm text-accent-strong sm:col-span-2">{t(err)}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={btnPriCls} disabled={pending}>
              {t("onbStartBtn")}
            </button>
            <button type="button" className={btnCls} onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
