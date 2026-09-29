"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addCandidateComment,
  addCandidateTask,
  getCandidateDetail,
  setCandidateInterviewDate,
  setCandidateTaskDone,
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
  // interview_scheduled_at is a UTC timestamp; <input type="datetime-local">
  // wants LOCAL wall-clock "YYYY-MM-DDTHH:mm". Round 41 fix: this used to be
  // iso.slice(0,16) — i.e. UTC shown as if local (12:00 Madrid showed 10:00)
  // and a naive string sent back that the DB then read as UTC.
  const initialInterviewDate = isoToLocalInput(candidate.interview_scheduled_at);
  const [interviewDate, setInterviewDate] = useState(initialInterviewDate);
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

  // Save on blur only if the value was actually edited — otherwise just
  // clicking into a field would write back the (possibly stale) value this
  // modal was opened with, overwriting a date/recording link that Calendly or
  // Zoom set in the meantime.
  function handleZoomSave() {
    if (zoomUrl === (candidate.zoom_recording_url ?? "")) return;
    startTransition(async () => {
      await setCandidateZoomUrl(candidate.id, zoomUrl || null);
    });
  }

  function handleInterviewDateSave() {
    if (interviewDate === initialInterviewDate) return;
    startTransition(async () => {
      await setCandidateInterviewDate(candidate.id, interviewDate ? new Date(interviewDate).toISOString() : null);
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

          <TasksSection candidateId={candidate.id} detail={detail} canEdit={canEdit} onChanged={reload} />
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
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-2">{linkify(value)}</p>
    </div>
  );
}

/**
 * "Добавь задачи в карточку лида [франчайзи]" (Anastasiia, round 44) — same
 * layout and behavior as leads/LeadDetailModal.tsx's own TasksSection, just
 * backed by addCandidateTask/setCandidateTaskDone instead of addTask/
 * setTaskDone (a franchise candidate task has no partner_id — see those
 * actions' own comments).
 */
function TasksSection({
  candidateId,
  detail,
  canEdit,
  onChanged,
}: {
  candidateId: string;
  detail: FranchiseCandidateDetail | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addCandidateTask(candidateId, text, due || null);
      if (res.error) setError(res.error);
      else {
        setText("");
        setDue("");
        onChanged();
      }
    });
  }

  function handleToggle(taskId: string, done: boolean) {
    startTransition(async () => {
      await setCandidateTaskDone(taskId, done);
      onChanged();
    });
  }

  const tasks = detail?.tasks ?? [];
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <div className="mt-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("headingTasks")}</span>
      {detail === null ? (
        <p className="mt-2 text-xs text-muted">{t("loading")}</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("emptyNoTasks")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {[...open, ...done].map((task) => (
            <label key={task.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={task.done}
                disabled={!canEdit || pending}
                onChange={(e) => handleToggle(task.id, e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span className={task.done ? "flex-1 text-muted line-through" : "flex-1 text-ink-2"}>{task.text}</span>
              {task.due_date && <span className="text-muted">{task.due_date}</span>}
            </label>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholderNewTask")}
            className="min-w-[140px] flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !text.trim()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {t("btnAddTaskShort")}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-accent-strong">{t(error)}</p>}
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
              <p className="mt-1 whitespace-pre-wrap break-words text-ink-2">{linkify(c.body)}</p>
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

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Turns http(s) URLs inside plain text into clickable links (opens in a new
 * tab). React escapes the surrounding text as usual — no raw HTML involved. */
function linkify(text: string | null | undefined) {
  if (!text) return text;
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="text-accent-strong underline break-all">
        {part}
      </a>
    ) : (
      part
    )
  );
}
