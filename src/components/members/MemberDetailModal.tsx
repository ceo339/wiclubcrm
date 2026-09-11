"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addEnrollment,
  addMemberComment,
  addMemberTask,
  deleteEnrollment,
  getMemberDetail,
  setAttendance,
  setMemberTaskDone,
  updateEnrollment,
  updateMember,
  type EnrollmentDetail,
  type MemberDetail,
} from "@/app/members/actions";
import { attendedArray, STATUSES, statusLabel, statusPillClasses } from "@/lib/members";
import Money from "@/components/currency/Money";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import SendEmailButton from "@/components/email/SendEmailButton";
import type { Tables } from "@/types/database";
import type { Member } from "./types";

export default function MemberDetailModal({
  member,
  products,
  cohorts,
  canEdit,
  onClose,
}: {
  member: Member;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemberDetail(member.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    getMemberDetail(member.id).then(setDetail);
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
            <h3 className="text-base font-semibold text-foreground">{member.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {member.city ?? "—"}
              {member.member_since ? ` · ${t("sincePrefix", { date: member.member_since })}` : ""}
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
          <EditForm member={member} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <ReadView member={member} canEdit={canEdit} onEdit={() => setEditing(true)} />
        )}

        <EnrollmentsSection
          memberId={member.id}
          detail={detail}
          products={products}
          cohorts={cohorts}
          canEdit={canEdit}
          onChanged={refresh}
        />

        <CommentsSection memberId={member.id} detail={detail} canEdit={canEdit} onChanged={refresh} />
        <TasksSection memberId={member.id} detail={detail} canEdit={canEdit} onChanged={refresh} />
      </div>
    </div>
  );
}

function ReadView({
  member,
  canEdit,
  onEdit,
}: {
  member: Member;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{t("fieldPhone")}</dt>
        <dd className="text-ink-2">{member.phone ?? "—"}</dd>
        <dt className="text-muted">{t("fieldEmail")}</dt>
        <dd className="text-ink-2">{member.email ?? "—"}</dd>
        {member.birthday && (
          <>
            <dt className="text-muted">{t("fieldBirthday")}</dt>
            <dd className="text-ink-2">{member.birthday}</dd>
          </>
        )}
      </dl>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("edit")}
          </button>
          <SendEmailButton entityType="member" entityId={member.id} email={member.email} />
        </div>
      )}
    </>
  );
}

function EditForm({
  member,
  onCancel,
  onSaved,
}: {
  member: Member;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateMember(member.id, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("colName")}</span>
        <input
          name="name"
          defaultValue={member.name}
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldPhone")}</span>
        <input
          name="phone"
          type="tel"
          defaultValue={member.phone ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldCity")}</span>
        <input
          name="city"
          defaultValue={member.city ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldEmail")}</span>
        <input
          name="email"
          type="email"
          defaultValue={member.email ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldBirthday")}</span>
        <input
          name="birthday"
          type="date"
          defaultValue={member.birthday ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldMemberSince")}</span>
        <input
          name="member_since"
          defaultValue={member.member_since ?? ""}
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

/**
 * The actual fix for "лид должен переходить в статус участниц на конкретные
 * курсы (может быть 2 и более)" — a member's card now holds as many of
 * these as she's enrolled in, each with its own status/price/dates/
 * attendance, instead of the old single product_id on the member row.
 */
function EnrollmentsSection({
  memberId,
  detail,
  products,
  cohorts,
  canEdit,
  onChanged,
}: {
  memberId: string;
  detail: MemberDetail | null;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const enrollments = detail?.enrollments ?? [];

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">{t("headingCourses")}</span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-ink-2 hover:underline"
          >
            {t("btnAddCourseShort")}
          </button>
        )}
      </div>

      {detail === null ? (
        <p className="mt-2 text-xs text-muted">{t("loading")}</p>
      ) : enrollments.length === 0 && !adding ? (
        <p className="mt-2 text-xs text-muted">{t("emptyNoCoursesForMember")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {enrollments.map((e) => (
            <EnrollmentCard key={e.id} enrollment={e} canEdit={canEdit} onChanged={onChanged} />
          ))}
        </div>
      )}

      {adding && (
        <NewEnrollmentForm
          memberId={memberId}
          products={products}
          cohorts={cohorts}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EnrollmentCard({
  enrollment,
  canEdit,
  onChanged,
}: {
  enrollment: EnrollmentDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteEnrollment(enrollment.id);
      if (res.error) setError(res.error);
      else onChanged();
    });
  }

  if (editing) {
    return (
      <EditEnrollmentForm
        enrollment={enrollment}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {enrollment.product_name ?? t("optionCourseNotChosen")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClasses(enrollment.status)}`}>
              {statusLabel(enrollment.status, locale)}
            </span>
            {enrollment.start_date && <span>{enrollment.start_date}</span>}
            <span className="text-ink-2">
              <Money amountEur={enrollment.price} />
            </span>
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted hover:text-ink-2"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleDelete}
              className="text-xs text-accent-strong hover:underline disabled:opacity-50"
            >
              {pending ? "..." : t("delete")}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-accent-strong">{t(error)}</p>}
      {enrollment.product_sessions ? (
        <EnrollmentAttendance enrollment={enrollment} canEdit={canEdit} onChanged={onChanged} />
      ) : null}
    </div>
  );
}

function EnrollmentAttendance({
  enrollment,
  canEdit,
  onChanged,
}: {
  enrollment: EnrollmentDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const sessions = enrollment.product_sessions ?? 0;
  const [attended, setAttended] = useState(() => attendedArray(enrollment.attended, sessions));
  const [pending, startTransition] = useTransition();

  function cycle(index: number) {
    if (!canEdit) return;
    const current = attended[index];
    const next = current === null ? true : current === true ? false : null;
    const optimistic = [...attended];
    optimistic[index] = next;
    setAttended(optimistic);
    startTransition(async () => {
      await setAttendance(enrollment.id, index, next);
      onChanged();
    });
  }

  const present = attended.filter((v) => v === true).length;
  const marked = attended.filter((v) => v !== null).length;
  const pct = marked > 0 ? Math.round((present / marked) * 100) : null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">{t("headingAttendance")}</span>
        <span className="text-xs text-muted">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {attended.map((v, i) => (
          <button
            key={i}
            type="button"
            disabled={!canEdit || pending}
            onClick={() => cycle(i)}
            title={t("attendanceSessionTitle", { n: i + 1 })}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium ${
              v === true
                ? "border-accent bg-accent/10 text-accent-strong"
                : v === false
                  ? "border-border bg-surface-2 text-muted line-through"
                  : "border-dashed border-border text-muted"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{t("attendanceCycleHint")}</p>
    </div>
  );
}

/** Shared status/date/price fields for both adding and editing an
 * enrollment — price is always a plain number the partner types, on
 * purpose (see project doc): a discount is just whatever she enters here,
 * not a second fixed price stored on the course itself. */
function EnrollmentFieldset({
  status,
  startDate,
  price,
  onStatusChange,
  onStartDateChange,
  onPriceChange,
}: {
  status: string;
  startDate: string;
  price: string;
  onStatusChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onPriceChange: (v: string) => void;
}) {
  const { locale, t } = useLocale();
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("colStatus")}</span>
        <select
          name="status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {statusLabel(s.id, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("colStartDate")}</span>
        <input
          name="start_date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldValueEur")}</span>
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>
    </>
  );
}

function EditEnrollmentForm({
  enrollment,
  onCancel,
  onSaved,
}: {
  enrollment: EnrollmentDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState(enrollment.status);
  const [startDate, setStartDate] = useState(enrollment.start_date ?? "");
  const [price, setPrice] = useState(String(enrollment.price));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateEnrollment(enrollment.id, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-border p-3">
      <div className="text-sm font-medium text-foreground">
        {enrollment.product_name ?? t("optionCourseNotChosen")}
      </div>
      <div className="mt-2 flex flex-col gap-3">
        <EnrollmentFieldset
          status={status}
          startDate={startDate}
          price={price}
          onStatusChange={setStatus}
          onStartDateChange={setStartDate}
          onPriceChange={setPrice}
        />
      </div>
      {error && <p className="mt-2 text-xs text-accent-strong">{t(error)}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
      </div>
    </form>
  );
}

function NewEnrollmentForm({
  memberId,
  products,
  cohorts,
  onCancel,
  onSaved,
}: {
  memberId: string;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState("sAwaiting");
  const [startDate, setStartDate] = useState("");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const productCohorts = useMemo(
    () =>
      cohorts
        .filter((c) => c.product_id === productId)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [cohorts, productId]
  );

  function handleProductChange(id: string) {
    setProductId(id);
    setStartDate("");
    const product = products.find((p) => p.id === id);
    if (product) setPrice(String(product.price));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addEnrollment(memberId, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fieldCourseOptional")}</span>
          <select
            name="product_id"
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">{t("optionCourseNotChosen")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · <Money amountEur={p.price} />
              </option>
            ))}
          </select>
        </label>

        {productId && productCohorts.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldCohortStart")}</span>
            <select
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">{t("optionNotChosen")}</option>
              {productCohorts.map((c) => (
                <option key={c.id} value={c.start_date}>
                  {c.start_date}
                </option>
              ))}
            </select>
          </label>
        )}

        <EnrollmentFieldset
          status={status}
          startDate={startDate}
          price={price}
          onStatusChange={setStatus}
          onStartDateChange={setStartDate}
          onPriceChange={setPrice}
        />
      </div>

      {error && <p className="mt-2 text-xs text-accent-strong">{t(error)}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("btnAddCourseShort")}
        </button>
      </div>
    </form>
  );
}

function CommentsSection({
  memberId,
  detail,
  canEdit,
  onChanged,
}: {
  memberId: string;
  detail: MemberDetail | null;
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
      const res = await addMemberComment(memberId, text);
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
  memberId,
  detail,
  canEdit,
  onChanged,
}: {
  memberId: string;
  detail: MemberDetail | null;
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
      const res = await addMemberTask(memberId, text, due || null);
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
      await setMemberTaskDone(taskId, done);
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
