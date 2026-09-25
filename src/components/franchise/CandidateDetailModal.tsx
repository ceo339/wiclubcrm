"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addCandidateComment,
  getCandidateDetail,
  setCandidateInterviewDate,
  setCandidateZoomUrl,
  updateCandidateStage,
  type FranchiseCandidateDetail,
} from "@/app/franchise/actions";
import { FRANCHISE_STAGES, FRANCHISE_TERMINAL_STAGES, franchiseStageLabel, type FranchiseStageId } from "@/lib/franchise";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import type { FranchiseCandidate } from "./types";
import ReasonModal from "./ReasonModal";

/**
 * Candidate card — laid out as the two panels from Anastasiia's reference
 * screenshot (25 сен 2026): a left "путь кандидатки" timeline and a right
 * контакты+действия column. Per her own answer to the clarifying question
 * ("Это референс дизайна карточки кандидатки"), only the LAYOUT is taken
 * from that screenshot — its ad-attribution timeline and "Позвонить
 * ИИ-продажником" button are a different product's feature she explicitly
 * doesn't want; the left panel here instead renders the real
 * franchise_stage_history timeline (every stage this candidate has actually
 * passed through, each with its own date — see lib/franchise.ts), and the
 * right panel's action button is a plain stage dropdown, not an AI caller.
 */
export default function CandidateDetailModal({
  candidate,
  canEdit,
  onClose,
}: {
  candidate: FranchiseCandidate;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [detail, setDetail] = useState<FranchiseCandidateDetail | null>(null);
  const [stage, setStage] = useState<FranchiseCandidate["stage"]>(candidate.stage);
  const [rejectReason, setRejectReason] = useState(candidate.reject_reason);
  const [reasonPromptStage, setReasonPromptStage] = useState<"declined" | "paused" | null>(null);
  const [zoomUrl, setZoomUrl] = useState(candidate.zoom_recording_url ?? "");
  const [interviewDate, setInterviewDate] = useState(
    candidate.interview_scheduled_at ? candidate.interview_scheduled_at.slice(0, 16) : ""
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reload() {
    getCandidateDetail(candidate.id).then(setDetail);
  }
  useEffect(reload, [candidate.id]);

  function handleStageChange(next: FranchiseStageId) {
    if (next === stage) return;
    if (FRANCHISE_TERMINAL_STAGES.includes(next)) {
      setReasonPromptStage(next as "declined" | "paused");
      return;
    }
    setStageError(null);
    startTransition(async () => {
      const res = await updateCandidateStage(candidate.id, next);
      if (res.error) setStageError(res.error);
      else {
        setStage(next);
        setRejectReason(null);
        reload();
      }
    });
  }

  function confirmReasonStage(reason: string | null) {
    const next = reasonPromptStage;
    setReasonPromptStage(null);
    if (!next) return;
    startTransition(async () => {
      const res = await updateCandidateStage(candidate.id, next, reason);
      if (res.error) setStageError(res.error);
      else {
        setStage(next);
        setRejectReason(reason);
        reload();
      }
    });
  }

  function handleZoomSave() {
    startTransition(async () => {
      await setCandidateZoomUrl(candidate.id, zoomUrl || null);
    });
  }

  function handleInterviewDateSave() {
    startTransition(async () => {
      await setCandidateInterviewDate(candidate.id, interviewDate || null);
    });
  }

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "bg" ? "bg-BG" : "ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div
        className="grid w-full max-w-4xl grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-border bg-background shadow-lg md:grid-cols-[1fr_1.3fr]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left panel — путь кандидатки */}
        <div className="border-b border-border bg-surface-2 p-5 md:border-b-0 md:border-r">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("fHeadingJourney")}</h3>
          <div className="mt-3 flex flex-col gap-3">
            {detail === null ? (
              <p className="text-xs text-muted">{t("loading")}</p>
            ) : detail.history.length === 0 ? (
              <p className="text-xs text-muted">{t("fEmptyNoHistory")}</p>
            ) : (
              detail.history.map((h, i) => (
                <div key={h.id} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        i === detail.history.length - 1 ? "bg-accent" : "bg-border-strong"
                      }`}
                    />
                    {i < detail.history.length - 1 && <span className="w-px flex-1 bg-border-strong" />}
                  </div>
                  <div className="pb-3">
                    <div className="text-sm font-medium text-foreground">{franchiseStageLabel(h.stage, locale)}</div>
                    <div className="text-xs text-muted">{dateFmt(h.occurred_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel — анкета + действия */}
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">{candidate.name}</h2>
            <button onClick={onClose} className="rounded-md p-1 text-lg leading-none text-muted hover:bg-surface-2">
              ×
            </button>
          </div>

          <div className="mt-1 text-xs text-muted">
            {t("fSubmittedAt")}: {dateFmt(candidate.submitted_at)}
          </div>

          {/* Действия */}
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("fHeadingActions")}</span>

            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fFieldStage")}</span>
              <select
                value={stage}
                disabled={!canEdit}
                onChange={(e) => handleStageChange(e.target.value as FranchiseStageId)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {FRANCHISE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {stageError && <p className="mt-1 text-xs text-accent-strong">{t(stageError)}</p>}
            {(stage === "declined" || stage === "paused") && rejectReason && (
              <p className="mt-2 rounded-lg bg-background p-2 text-xs text-accent-strong">{rejectReason}</p>
            )}

            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fFieldInterviewDate")}</span>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={interviewDate}
                  disabled={!canEdit}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  onBlur={handleInterviewDateSave}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
                />
              </div>
            </label>

            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fFieldZoomUrl")}</span>
              <input
                value={zoomUrl}
                disabled={!canEdit}
                onChange={(e) => setZoomUrl(e.target.value)}
                onBlur={handleZoomSave}
                placeholder="https://zoom.us/rec/..."
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </label>
            {candidate.zoom_recording_url && (
              <a
                href={candidate.zoom_recording_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-accent-strong underline"
              >
                {t("fOpenZoomRecording")}
              </a>
            )}
          </div>

          {/* Анкета */}
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("fHeadingApplication")}</span>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Field label={t("fFieldEmail")} value={candidate.email} />
              <Field label={t("fFieldPhone")} value={candidate.phone} />
              <Field label={t("fFieldTelegram")} value={candidate.telegram} />
              <Field label={t("fFieldCountry")} value={candidate.country} />
              <Field label={t("fFieldTargetCity")} value={candidate.target_city} />
              <Field label={t("fFieldBirthDate")} value={candidate.birth_date} />
              <Field label={t("fFieldInstagram")} value={candidate.instagram_url} />
              <Field label={t("fFieldFollowers")} value={candidate.followers} />
              <Field label={t("fFieldSource")} value={candidate.source} />
              <Field label={t("fFieldKnowsMethod")} value={candidate.knows_method} />
              <Field label={t("fFieldTrainOrHire")} value={candidate.train_or_hire} />
              <Field label={t("fFieldReadyWhen")} value={candidate.ready_when} />
              <Field label={t("fFieldBudget")} value={candidate.budget} />
            </dl>
            <LongField label={t("fFieldOccupation")} value={candidate.occupation} />
            <LongField label={t("fFieldExperience")} value={candidate.experience} />
            <LongField label={t("fFieldContentDescription")} value={candidate.content_description} />
            <LongField label={t("fFieldWhyCity")} value={candidate.why_city} />
            <LongField label={t("fFieldFears")} value={candidate.fears} />
            <LongField label={t("fFieldQuestions")} value={candidate.questions} />
            {candidate.internal_note && <LongField label={t("fFieldInternalNote")} value={candidate.internal_note} />}
          </div>

          <CommentsSection candidateId={candidate.id} detail={detail} canEdit={canEdit} onChanged={reload} />
        </div>
      </div>

      {reasonPromptStage && (
        <ReasonModal
          candidateName={candidate.name}
          stage={reasonPromptStage}
          onCancel={() => setReasonPromptStage(null)}
          onConfirm={confirmReasonStage}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-ink-2">{value}</dd>
    </div>
  );
}

function LongField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2.5">
      <div className="text-xs text-muted">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{value}</p>
    </div>
  );
}

function CommentsSection({
  candidateId,
  detail,
  canEdit,
  onChanged,
}: {
  candidateId: string;
  detail: FranchiseCandidateDetail | null;
  /** Comments are open to anyone with at least view access (see
   * addCandidateComment) — "разными людьми, кто одобряет кандидата" (п.7)
   * means a reviewer without edit rights still needs to be able to leave
   * their own approve/decline note, so this section ignores `canEdit` and
   * always shows the composer once the parent has confirmed at least view
   * access (the modal is never opened otherwise). */
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  void canEdit;

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addCandidateComment(candidateId, text);
      if (res.error) setError(res.error);
      else {
        setText("");
        onChanged();
      }
    });
  }

  return (
    <div className="mt-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("fHeadingComments")}</span>
      {detail === null ? (
        <p className="mt-2 text-xs text-muted">{t("loading")}</p>
      ) : detail.comments.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("emptyNoComments")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {detail.comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span className="font-medium text-ink-2">{c.author_name}</span>
                <span>{new Date(c.created_at).toLocaleString(locale === "bg" ? "bg-BG" : "ru-RU")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={t("placeholderAddComment")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !text.trim()}
          className="self-start rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {t("add")}
        </button>
      </div>
    </div>
  );
}
