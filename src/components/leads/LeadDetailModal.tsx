"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addComment,
  addTask,
  convertLeadToMember,
  getLeadDetail,
  setTaskDone,
  updateLead,
  type LeadDetail,
} from "@/app/leads/actions";
import {
  COUNTRIES,
  GENERIC_PLANS,
  declineReasonLabel,
  sourceLabel,
  stageLabel,
} from "@/lib/leads";
import Money from "@/components/currency/Money";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import T from "@/components/i18n/T";
import type { Lead } from "./types";

export default function LeadDetailModal({
  lead,
  canEdit,
  onClose,
}: {
  lead: Lead;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLeadDetail(lead.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshDetail() {
    getLeadDetail(lead.id).then(setDetail);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{lead.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {lead.source ? sourceLabel(lead.source, locale) : "—"} ·{" "}
              {stageLabel(lead.stage, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-muted hover:text-ink-2"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        {editing ? (
          <EditForm lead={lead} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <ReadView lead={lead} canEdit={canEdit} onEdit={() => setEditing(true)} />
        )}

        <CommentsSection leadId={lead.id} detail={detail} canEdit={canEdit} onChanged={refreshDetail} />
        <TasksSection leadId={lead.id} detail={detail} canEdit={canEdit} onChanged={refreshDetail} />
      </div>
    </div>
  );
}

function ReadView({
  lead,
  canEdit,
  onEdit,
}: {
  lead: Lead;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { locale, t } = useLocale();
  const plan = lead.plan ? GENERIC_PLANS.find((p) => p.id === lead.plan) : null;

  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label={t("fieldPhone")} value={lead.phone} />
        <Row label={t("fieldEmail")} value={lead.email} />
        <Row label={t("fieldCountry")} value={lead.country} />
        <Row label={t("fieldCity")} value={lead.city} />
        <Row label={t("fieldBirthday")} value={lead.birthday} />
        <Row label={t("colAdded")} value={lead.added_date} />
        {lead.value ? (
          <>
            <dt className="text-muted">{t("colAmount")}</dt>
            <dd className="text-ink-2">
              <Money amountEur={lead.value} />
            </dd>
          </>
        ) : null}
        {lead.plan && (
          <>
            <dt className="text-muted">{t("fieldInterestedIn")}</dt>
            <dd className="text-ink-2">
              {plan ? (
                <>
                  <T k={plan.id} /> · <Money amountEur={plan.price} />
                </>
              ) : (
                lead.plan
              )}
            </dd>
          </>
        )}
        {lead.cohort_start_date && <Row label={t("fieldCohortStart")} value={lead.cohort_start_date} />}
        {lead.stage === "declined" && lead.decline_reason && (
          <Row
            label={t("declineModalTitle")}
            value={`${declineReasonLabel(lead.decline_reason, locale)}${
              lead.decline_note ? " · " + lead.decline_note : ""
            }`}
          />
        )}
      </dl>

      {lead.note && (
        <div className="mt-4">
          <span className="text-xs font-medium text-ink-2">{t("fieldNote")}</span>
          <p className="mt-1 text-sm text-ink-2">{lead.note}</p>
        </div>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("edit")}
          </button>
          {lead.stage === "paid" && <ConvertToMemberButton leadId={lead.id} />}
        </div>
      )}
    </>
  );
}

function ConvertToMemberButton({ leadId }: { leadId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="text-xs text-muted">{t("convertedToMember")}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await convertLeadToMember(leadId);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
        className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
      >
        {pending ? "..." : t("btnConvertToMember")}
      </button>
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink-2">{value}</dd>
    </>
  );
}

function EditForm({
  lead,
  onCancel,
  onSaved,
}: {
  lead: Lead;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateLead(lead.id, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-4 flex flex-col gap-3">
      <Field label={t("colName")} name="name" defaultValue={lead.name} required />
      <Field label={t("fieldEmail")} name="email" type="email" defaultValue={lead.email ?? ""} />
      <Field label={t("fieldPhone")} name="phone" type="tel" defaultValue={lead.phone ?? ""} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldCountry")}</span>
        <select
          name="country"
          defaultValue={lead.country ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">{t("optionNotSpecified")}</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <Field label={t("fieldCity")} name="city" defaultValue={lead.city ?? ""} />
      <Field label={t("fieldBirthday")} name="birthday" type="date" defaultValue={lead.birthday ?? ""} />
      <Field label={t("fieldValueEur")} name="value" type="number" defaultValue={String(lead.value ?? 0)} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldNote")}</span>
        <textarea
          name="note"
          rows={3}
          defaultValue={lead.note ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      {error && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}

function CommentsSection({
  leadId,
  detail,
  canEdit,
  onChanged,
}: {
  leadId: string;
  detail: LeadDetail | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addComment(leadId, text);
      if (res.error) setError(res.error);
      else {
        setText("");
        onChanged();
      }
    });
  }

  return (
    <div className="mt-5">
      <span className="text-xs font-medium text-ink-2">{t("headingComments")}</span>
      {detail === null ? (
        <p className="mt-2 text-xs text-muted">{t("loading")}</p>
      ) : detail.comments.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("emptyNoComments")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {detail.comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span className="font-medium text-ink-2">{c.author}</span>
                <span>{new Date(c.created_at).toLocaleString(locale === "bg" ? "bg-BG" : "ru-RU")}</span>
              </div>
              <p className="mt-1 text-ink-2">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
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
      )}
    </div>
  );
}

function TasksSection({
  leadId,
  detail,
  canEdit,
  onChanged,
}: {
  leadId: string;
  detail: LeadDetail | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addTask(leadId, text, due || null);
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
      await setTaskDone(taskId, done);
      onChanged();
    });
  }

  const tasks = detail?.tasks ?? [];
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <div className="mt-5">
      <span className="text-xs font-medium text-ink-2">{t("headingTasks")}</span>
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
              <span className={task.done ? "flex-1 text-muted line-through" : "flex-1 text-ink-2"}>
                {task.text}
              </span>
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
