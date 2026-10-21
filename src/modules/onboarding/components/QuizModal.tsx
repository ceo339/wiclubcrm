"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { getQuiz, submitQuiz } from "../actions";
import { quizPassMark, type QuizQuestionPublic, type QuizReview } from "../types";
import { Card, Chip, btnCls, btnPriCls } from "./ui";

/** Прохождение квиза по материалу: вопросы по одному, проверка на сервере, разбор ошибок. */
export default function QuizModal({ planItemId, onClose }: { planItemId: string; onClose: () => void }) {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuizQuestionPublic[] | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [review, setReview] = useState<QuizReview | null>(null);

  function restart() {
    setError(null);
    setReview(null);
    setStep(0);
    setAnswers({});
    fetchQuiz();
  }
  function fetchQuiz() {
    start(async () => {
      const r = await getQuiz(planItemId);
      if (r.error) setError(r.error);
      else {
        setTitle(r.title ?? "");
        setQuestions(r.questions ?? []);
      }
    });
  }
  useEffect(() => {
    fetchQuiz();
  }, [planItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    start(async () => {
      const r = await submitQuiz(planItemId, answers);
      if (r.error) setError(r.error);
      else {
        setReview(r.review ?? null);
        router.refresh();
      }
    });
  }

  const q = questions?.[step];
  const last = !!questions && step === questions.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-2xl p-6 shadow-card-lg">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{t("onbQuiz")}</div>
          <h3 className="mb-4 font-display text-xl leading-snug">{title || "…"}</h3>

          {error && (
            <div className="space-y-3">
              <p className="text-sm text-accent-strong">{t(error)}</p>
              <button type="button" className={btnCls} onClick={onClose}>
                {t("close")}
              </button>
            </div>
          )}

          {!error && !review && !questions && <p className="text-sm text-muted">…</p>}

          {!error && !review && q && questions && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <i className="block h-full rounded-full bg-accent" style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted">{t("onbQuizStep", { n: step + 1, total: questions.length })}</span>
              </div>
              <div className="text-lg font-semibold leading-snug">{q.question}</div>
              <div className="space-y-2">
                {q.options.map((o, k) => {
                  const on = answers[q.id] === k;
                  return (
                    <label
                      key={k}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px] ${on ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}
                    >
                      <input type="radio" name={q.id} checked={on} onChange={() => setAnswers({ ...answers, [q.id]: k })} className="h-4 w-4" />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-between gap-2">
                <button type="button" className={btnCls} disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>
                  {t("onbQuizBack")}
                </button>
                {last ? (
                  <button type="button" className={btnPriCls} disabled={answers[q.id] === undefined || pending} onClick={finish}>
                    {pending ? "…" : t("onbQuizFinish")}
                  </button>
                ) : (
                  <button type="button" className={btnPriCls} disabled={answers[q.id] === undefined} onClick={() => setStep(step + 1)}>
                    {t("onbQuizNext")}
                  </button>
                )}
              </div>
            </div>
          )}

          {review && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-[6px] ${review.passed ? "border-accent" : "border-border-strong"}`}>
                  <b className="font-display text-2xl leading-none">
                    {review.score}/{review.total}
                  </b>
                </div>
                <div>
                  <div className="font-display text-xl">{review.passed ? t("onbQuizPassed") : t("onbQuizFailed")}</div>
                  <div className="text-sm text-muted">{t("onbQuizPassMark", { n: quizPassMark(review.total), total: review.total })}</div>
                </div>
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {review.items.map((it, k) => {
                  const ok = it.chosen === it.correct;
                  return (
                    <div key={k} className={`px-4 py-3 text-sm ${ok ? "" : "bg-accent-soft/50"}`}>
                      <div className="flex gap-2">
                        <Chip tone={ok ? "line" : "red"}>{ok ? "✓" : "!"}</Chip>
                        <b className="leading-snug">{it.question}</b>
                      </div>
                      {!ok && (
                        <div className="mt-1.5 space-y-0.5 pl-9">
                          {it.chosen !== null && (
                            <div className="text-accent-strong">
                              {t("onbQuizYour")}: {it.options[it.chosen]}
                            </div>
                          )}
                          <div>
                            {t("onbQuizRight")}: {it.options[it.correct]}
                          </div>
                          {it.explanation && <div className="text-muted">{it.explanation}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" className={btnPriCls} onClick={onClose}>
                  {t("close")}
                </button>
                <button type="button" className={btnCls} disabled={pending} onClick={restart}>
                  {t("onbQuizRetry")}
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
