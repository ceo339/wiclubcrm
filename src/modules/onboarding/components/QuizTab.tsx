"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { PlanItem, QuizAttempt, QuizQuestion } from "../types";
import QuizModal from "./QuizModal";
import { Card, Chip, btnCls, fmtDate } from "./ui";

/** Результаты квизов партнера: по каждому материалу последняя попытка и ошибки. */
export default function QuizTab({
  items,
  attempts,
  questions,
  canTake,
}: {
  items: PlanItem[];
  attempts: QuizAttempt[];
  /** Только у hq: для разбора ошибок по тексту вопроса. */
  questions: QuizQuestion[] | null;
  canTake: boolean;
}) {
  const { t } = useLocale();
  const [take, setTake] = useState<string | null>(null);
  const quizItems = items.filter((i) => i.tags.includes("квиз") && !i.hidden && i.template_item_id);
  const byItem = new Map<string, QuizAttempt[]>();
  for (const a of attempts) byItem.set(a.plan_item_id, [...(byItem.get(a.plan_item_id) ?? []), a]);
  const qById = new Map((questions ?? []).map((q) => [q.id, q]));

  const lastOf = (id: string) => byItem.get(id)?.[0];
  const done = quizItems.filter((i) => lastOf(i.id));
  const avg = done.length ? Math.round((done.reduce((s, i) => s + lastOf(i.id)!.score / lastOf(i.id)!.total, 0) / done.length) * 100) : 0;
  const failed = done.filter((i) => !lastOf(i.id)!.passed).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">{t("onbQuizDone")}</div>
          <div className="font-display text-2xl">{t("onbQuizOf", { n: done.length, total: quizItems.length })}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("onbQuizAvg")}</div>
          <div className="font-display text-2xl">{done.length ? `${avg} %` : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("onbQuizBelow")}</div>
          <div className={`font-display text-2xl ${failed ? "text-accent-strong" : ""}`}>{failed}</div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        {quizItems.map((i) => {
          const list = byItem.get(i.id) ?? [];
          const a = list[0];
          const wrong = a && questions ? Object.keys(a.answers).length ? collectWrong(a, qById) : [] : [];
          return (
            <div key={i.id} className={`grid gap-2 border-t border-border px-5 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,1.6fr)_90px_80px_70px_minmax(0,2fr)_auto] md:items-center ${a && !a.passed ? "bg-accent-soft/40" : ""}`}>
              <b className="text-sm leading-snug">{i.title}</b>
              <span>{a ? <Chip tone={a.passed ? "line" : "red"}>{`${a.score}/${a.total}`}</Chip> : <span className="text-xs text-muted">{i.status === "done" ? t("onbQuizNotYet") : t("onbQuizAfterStudy")}</span>}</span>
              <span className="text-xs tabular-nums text-muted">{a ? fmtDate(a.created_at) : ""}</span>
              <span className="text-xs text-muted">{list.length ? t("onbQuizTries", { n: list.length }) : ""}</span>
              <span className="text-xs text-ink-2">
                {wrong.map((w, k) => (
                  <span key={k} className="block">
                    • {w}
                  </span>
                ))}
              </span>
              <span>
                {canTake && i.status === "done" && (
                  <button type="button" className={`${btnCls} !py-1 !text-xs`} onClick={() => setTake(i.id)}>
                    {a ? t("onbQuizRetry") : t("onbQuizTake")}
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {!quizItems.length && <p className="px-5 py-6 text-sm text-muted">{t("onbQuizNone")}</p>}
      </Card>
      {take && <QuizModal planItemId={take} onClose={() => setTake(null)} />}
    </div>
  );
}

function collectWrong(a: QuizAttempt, qById: Map<string, QuizQuestion>): string[] {
  const out: string[] = [];
  for (const [qid, chosen] of Object.entries(a.answers)) {
    const q = qById.get(qid);
    if (q && chosen !== q.correct) out.push(q.question);
  }
  return out;
}
