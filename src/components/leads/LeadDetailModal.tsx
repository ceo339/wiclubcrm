"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addComment,
  addTask,
  convertLeadToMember,
  deleteLead,
  getLeadDetail,
  setTaskDone,
  updateLead,
  updateLeadStage,
  type LeadDetail,
} from "@/app/leads/actions";
import {
  COUNTRIES,
  GENERIC_PLANS,
  SOURCES,
  STAGES,
  countryDefaultCity,
  declineReasonLabel,
  sourceLabel,
  stageLabel,
  type StageId,
} from "@/lib/leads";
import Money from "@/components/currency/Money";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import T from "@/components/i18n/T";
import SendEmailButton from "@/components/email/SendEmailButton";
import DeclineModal from "./DeclineModal";
import type { Lead } from "./types";
import type { Tables } from "@/types/database";

type Product = Tables<"products">;
type Cohort = Tables<"product_cohorts">;

export default function LeadDetailModal({
  lead,
  canEdit,
  isHq,
  products,
  cohorts,
  partnerCountry,
  onClose,
}: {
  lead: Lead;
  canEdit: boolean;
  isHq: boolean;
  products: Product[];
  cohorts: Cohort[];
  /** The signed-in club's own country — used the same way as in
   * NewLeadModal, to default an existing lead's country/city when editing
   * one that was saved before that field was set (e.g. an older Sofia-club
   * lead with no country recorded). */
  partnerCountry: string | null;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [, startStageTransition] = useTransition();

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

  function handleStageChange(next: StageId) {
    if (next === lead.stage) return;
    setStageError(null);
    if (next === "declined") {
      setShowDeclineModal(true);
      return;
    }
    startStageTransition(async () => {
      const res = await updateLeadStage(lead.id, next);
      if (res.error) setStageError(res.error);
    });
  }

  function handleDeclineConfirm(reason: string, note: string | null) {
    setShowDeclineModal(false);
    startStageTransition(async () => {
      const res = await updateLeadStage(lead.id, "declined", { reason, note });
      if (res.error) setStageError(res.error);
    });
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
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">{lead.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{lead.source ? sourceLabel(lead.source, locale) : "—"}</span>
              <span>·</span>
              {canEdit ? (
                <select
                  value={lead.stage}
                  onChange={(e) => handleStageChange(e.target.value as StageId)}
                  className="rounded-md border border-border bg-background px-1.5 py-1 text-xs font-medium text-ink-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{stageLabel(lead.stage, locale)}</span>
              )}
            </div>
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
        {stageError && (
          <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent-strong">
            {t(stageError)}
          </p>
        )}

        {editing ? (
          <EditForm
            lead={lead}
            partnerCountry={partnerCountry}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <ReadView
            lead={lead}
            canEdit={canEdit}
            isHq={isHq}
            products={products}
            cohorts={cohorts}
            onEdit={() => setEditing(true)}
            onDeleted={onClose}
          />
        )}

        <CommentsSection leadId={lead.id} detail={detail} canEdit={canEdit} onChanged={refreshDetail} />
        <TasksSection leadId={lead.id} detail={detail} canEdit={canEdit} onChanged={refreshDetail} />
      </div>

      {showDeclineModal && (
        <DeclineModal
          leadName={lead.name}
          onCancel={() => setShowDeclineModal(false)}
          onConfirm={handleDeclineConfirm}
        />
      )}
    </div>
  );
}

function ReadView({
  lead,
  canEdit,
  isHq,
  products,
  cohorts,
  onEdit,
  onDeleted,
}: {
  lead: Lead;
  canEdit: boolean;
  isHq: boolean;
  products: Product[];
  cohorts: Cohort[];
  onEdit: () => void;
  onDeleted: () => void;
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
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("edit")}
          </button>
          {lead.stage === "paid" && (
            <ConvertToMemberButton lead={lead} products={products} cohorts={cohorts} />
          )}
          <SendEmailButton entityType="lead" entityId={lead.id} email={lead.email} />
        </div>
      )}
      {isHq && (
        <div className="mt-4">
          <DeleteLeadButton leadId={lead.id} onDeleted={onDeleted} />
        </div>
      )}
    </>
  );
}

/**
 * Only ever rendered for hq accounts (see the `isHq` check in ReadView) —
 * per Anastasiia's decision, deleting a lead is deliberately not something
 * a club's own partner login can do, only "Управляющая компания". Backed
 * by the errOnlyHqCanDelete check in deleteLead() and the leads_delete_hq
 * RLS policy, not just this UI condition.
 */
function DeleteLeadButton({ leadId, onDeleted }: { leadId: string; onDeleted: () => void }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-accent-strong px-3 py-1.5 text-xs font-medium text-accent-strong hover:bg-accent/10"
      >
        {t("btnDeleteLead")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-accent-strong">{t("confirmDeleteLead")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteLead(leadId);
              if (res.error) setError(res.error);
              else onDeleted();
            })
          }
          className="rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "..." : t("yes")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
      </div>
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
    </div>
  );
}

/**
 * Turns a paid lead into a member. When the club has real courses set up,
 * this opens an inline picker first — Anastasiia's request (11 сен 2026):
 * she wants to choose (or change) the course right here as part of the
 * conversion, not just have whatever course/cohort happened to already be
 * on the lead copied over silently. Defaults to the lead's own
 * course/cohort/amount when it has one, but she can pick a different course
 * or leave it unset. Clubs with no courses yet skip straight to a single
 * confirm button (same as before this change).
 */
function ConvertToMemberButton({
  lead,
  products,
  cohorts,
}: {
  lead: Lead;
  products: Product[];
  cohorts: Cohort[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(lead.product_id ?? "");
  const [cohortDate, setCohortDate] = useState(lead.cohort_start_date ?? "");
  const [price, setPrice] = useState(String(lead.value ?? 0));

  const productCohorts = useMemo(
    () => cohorts.filter((c) => c.product_id === productId),
    [cohorts, productId]
  );

  function handleProductChange(id: string) {
    setProductId(id);
    setCohortDate("");
    const product = products.find((p) => p.id === id);
    if (product) setPrice(String(product.price));
  }

  function confirm() {
    startTransition(async () => {
      const res = await convertLeadToMember(lead.id, {
        productId: productId || null,
        cohortStartDate: cohortDate || null,
        price: Number(String(price).replace(",", ".")) || 0,
      });
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  if (done) {
    return <p className="text-xs text-muted">{t("convertedToMember")}</p>;
  }

  // No courses configured at all — nothing to pick, keep the old one-click flow.
  if (products.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("btnConvertToMember")}
        </button>
        {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
      >
        {t("btnConvertToMember")}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-xs font-medium text-ink-2">{t("chooseCourseOnConvert")}</p>
      <select
        value={productId}
        onChange={(e) => handleProductChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <option value="">{t("optionCourseNotChosen")}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {productId && (
        <select
          value={cohortDate}
          onChange={(e) => setCohortDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">{t("optionNotChosen")}</option>
          {productCohorts.map((c) => (
            <option key={c.id} value={c.start_date}>
              {c.start_date}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">{t("fieldValueEur")}</span>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("btnConfirmConvert")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
      </div>
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
  partnerCountry,
  onCancel,
  onSaved,
}: {
  lead: Lead;
  partnerCountry: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A lead saved before country/city was set (or before this club's own
  // country was known) defaults to the signed-in club's own location here —
  // e.g. a Sofia-club lead with no country recorded shows Bulgaria/Sofia
  // rather than "— не указано —" — matching the same default NewLeadModal
  // gives a brand-new lead. Anastasiia's request, 11 сен 2026.
  const [country, setCountry] = useState(() => lead.country || partnerCountry || "");
  const [city, setCity] = useState(() => lead.city || countryDefaultCity(lead.country || partnerCountry) || "");

  function handleCountryChange(name: string) {
    setCountry(name);
    const defaultCity = countryDefaultCity(name);
    if (defaultCity) setCity(defaultCity);
  }

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
        <span className="font-medium text-ink-2">{t("fieldSource")}</span>
        <select
          name="source"
          defaultValue={lead.source ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">{t("optionNotSpecified")}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldCountry")}</span>
        <select
          name="country"
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
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

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldCity")}</span>
        <input
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

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
