"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addEnrollment,
  addEnrollmentPayment,
  addMemberComment,
  markEnrollmentNoShow,
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
import {
  assignPackageItem,
  createPackageSale,
  deletePackageSale,
  getPackageSalesForMember,
  type PackageSaleDetail,
} from "@/app/packages/actions";
import { attendedArray, STATUSES, statusLabel, statusPillClasses } from "@/lib/members";
import { DECLINE_REASONS, stageLabel } from "@/lib/leads";
import { convertFromEur, convertToEur, currencySymbol, roundMoney } from "@/lib/currency";
import Money from "@/components/currency/Money";
import { useCurrency } from "@/components/currency/CurrencyProvider";
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
  const [packages, setPackages] = useState<PackageSaleDetail[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMemberDetail(member.id), getPackageSalesForMember(member.id)]).then(([d, p]) => {
      if (!cancelled) {
        setDetail(d);
        setPackages(p);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    getMemberDetail(member.id).then(setDetail);
    getPackageSalesForMember(member.id).then(setPackages);
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

        <PackageSalesSection
          memberId={member.id}
          packages={packages}
          products={products}
          cohorts={cohorts}
          canEdit={canEdit}
          onChanged={refresh}
        />

        <ContactLeadsSection detail={detail} />

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
            <EnrollmentCard key={e.id} enrollment={e} cohorts={cohorts} canEdit={canEdit} onChanged={onChanged} />
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
  cohorts,
  canEdit,
  onChanged,
}: {
  enrollment: EnrollmentDetail;
  cohorts: Tables<"product_cohorts">[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { locale, t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<"none" | "pay" | "noshow">("none");
  const price = Number(enrollment.price) || 0;
  const paidSum = enrollment.paid_sum ?? 0;
  const remaining = Math.max(0, price - paidSum);
  const isOpenForMoney = ["sAwaiting", "sPartial", "sPaid"].includes(enrollment.status);
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
            {enrollment.status === "sPaid" && price > 0 && remaining > 0.01 && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">{t("tagPartial")}</span>
            )}
            {enrollment.start_date && <span>{enrollment.start_date}</span>}
            <span className="text-ink-2">
              <Money amountEur={enrollment.price} />
            </span>
          </div>
          {price > 0 && paidSum > 0 && (
            <div className="mt-1 text-xs text-ink-2">
              {t("enrollPaidOf")} <Money amountEur={paidSum} /> / <Money amountEur={price} />
              {remaining > 0.01 && (
                <span className="text-warn">
                  {" · "}
                  {t("enrollRemaining")} <Money amountEur={remaining} />
                </span>
              )}
            </div>
          )}
          {/* 2 Oct 2026 — «добавь сюда даты оплаты»: every payment of this
              поток with its date. */}
          {(enrollment.payments ?? []).length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
              {enrollment.payments.map((p) => (
                <li key={p.id} className={p.status === "refunded" ? "line-through" : ""}>
                  {p.paid_date ? p.paid_date.split("-").reverse().join(".") : "—"}
                  {" · "}
                  <Money amountEur={Number(p.amount)} />
                  {p.is_partial ? ` · ${t("tagPartial")}` : ""}
                  {p.status === "pending" ? ` · ${t("payStatusPending").toLowerCase()}` : ""}
                </li>
              ))}
            </ul>
          )}
          {enrollment.note && <div className="mt-1 text-xs text-muted">{enrollment.note}</div>}
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

      {canEdit && enrollment.status !== "sNoShow" && panel === "none" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {isOpenForMoney && price > 0 && remaining > 0.01 && (
            <button
              type="button"
              onClick={() => setPanel("pay")}
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              {paidSum > 0 ? t("btnTopUp") : t("btnFirstPayment")}
            </button>
          )}
          {/* "для курса завершенного тоже нужна кнопка не пришла и с
              переносом" (Anastasiia, 5 окт 2026) — a course can get marked
              «Завершила курс» (e.g. via bulk attendance) before anyone
              notices she actually never showed up, and there was no way to
              fix that after the fact. sRefunded stays excluded — a
              refunded поток is already closed out, nothing left to mark. */}
          {enrollment.status !== "sRefunded" && (
            <button
              type="button"
              onClick={() => setPanel("noshow")}
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("btnNoShow")}
            </button>
          )}
        </div>
      )}
      {panel === "pay" && (
        <TopUpForm
          enrollmentId={enrollment.id}
          defaultEur={remaining}
          onCancel={() => setPanel("none")}
          onSaved={() => {
            setPanel("none");
            onChanged();
          }}
        />
      )}
      {panel === "noshow" && (
        <NoShowForm
          enrollment={enrollment}
          cohorts={cohorts}
          onCancel={() => setPanel("none")}
          onSaved={() => {
            setPanel("none");
            onChanged();
          }}
        />
      )}

      {enrollment.product_sessions && enrollment.status !== "sNoShow" ? (
        <EnrollmentAttendance enrollment={enrollment} canEdit={canEdit} onChanged={onChanged} />
      ) : null}
    </div>
  );
}

const smallInput =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent";

/** Round 53 — «+ Доплата»: one more payment for this exact поток. */
function TopUpForm({
  enrollmentId,
  defaultEur,
  onCancel,
  onSaved,
}: {
  enrollmentId: string;
  defaultEur: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { currency, rates } = useCurrency();
  const [amount, setAmount] = useState(String(roundMoney(convertFromEur(defaultEur, currency, rates), currency)));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partial, setPartial] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await addEnrollmentPayment(
        enrollmentId,
        convertToEur(parseFloat(amount.replace(",", ".")) || 0, currency, rates),
        date,
        partial
      );
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ink-2">
            {t("fieldAmount")} ({currencySymbol(currency)})
          </span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={smallInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ink-2">{t("colDate")}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={smallInput} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-3.5 w-3.5" />
        {t("fieldIsPartial")}
      </label>
      {!partial && <p className="text-xs text-muted">{t("hintNotPartial")}</p>}
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={pending || !amount}
          onClick={save}
          className="rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
      </div>
    </div>
  );
}

/**
 * Round 53 — «Не была на курсе»: either move her (with her payments) to
 * another поток of the same course, or close it as «Отказ» with a reason
 * (her lead goes to «Отказ» too). See markEnrollmentNoShow.
 */
function NoShowForm({
  enrollment,
  cohorts,
  onCancel,
  onSaved,
}: {
  enrollment: EnrollmentDetail;
  cohorts: Tables<"product_cohorts">[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useLocale();
  const [mode, setMode] = useState<"transfer" | "decline">("transfer");
  const today = new Date().toISOString().slice(0, 10);
  const otherCohorts = cohorts
    .filter((c) => c.product_id === enrollment.product_id && c.start_date !== enrollment.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = otherCohorts.filter((c) => c.start_date >= today);
  const [startDate, setStartDate] = useState(upcoming[0]?.start_date ?? "");
  const [reason, setReason] = useState<string>("declineNoTime");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await markEnrollmentNoShow(
        enrollment.id,
        mode === "transfer" ? { mode, startDate } : { mode, reason, note: note || null }
      );
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  const tab = (m: "transfer" | "decline", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === m ? "bg-foreground text-background" : "bg-surface-2 text-ink-2"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <div className="text-xs font-medium text-ink-2">{t("noShowHeading")}</div>
      <div className="flex flex-wrap gap-1.5">
        {tab("transfer", t("noShowTransfer"))}
        {tab("decline", t("noShowDecline"))}
      </div>
      {mode === "transfer" ? (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ink-2">{t("fieldCohortStart")}</span>
          {otherCohorts.length > 0 ? (
            <select value={startDate} onChange={(e) => setStartDate(e.target.value)} className={smallInput}>
              <option value="">—</option>
              {otherCohorts.map((c) => (
                <option key={c.id} value={c.start_date}>
                  {c.start_date.split("-").reverse().join(".")}
                  {c.start_date < today ? ` (${t("noShowPastCohort")})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={smallInput} />
          )}
          <span className="text-muted">{t("noShowTransferHint")}</span>
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-ink-2">{t("fieldDeclineReason")}</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={smallInput}>
              {DECLINE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(r)}
                </option>
              ))}
            </select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("noShowNotePlaceholder")} className={smallInput} />
          <span className="text-xs text-muted">{t("noShowDeclineHint")}</span>
        </div>
      )}
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={pending || (mode === "transfer" && !startDate)}
          onClick={save}
          className="rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("save")}
        </button>
      </div>
      {void locale}
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
 * not a second fixed price stored on the course itself. `price` here is a
 * currency-native display string (the parent already converted it from EUR
 * — see EditEnrollmentForm/NewEnrollmentForm); a hidden input converts it
 * back to EUR at submit time, same pattern as MoneyAmountField ("если я
 * выбрала валюту Лари, то я и ввожу везде сумму в этой валюте", Anastasiia,
 * 14 сен 2026). */
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
  const { currency, rates } = useCurrency();
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
        <span className="font-medium text-ink-2">
          {t("fieldAmount")} ({currencySymbol(currency)})
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <input
          type="hidden"
          name="price"
          value={String(convertToEur(parseFloat(price) || 0, currency, rates))}
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
  const { currency, rates } = useCurrency();
  const [status, setStatus] = useState(enrollment.status);
  const [startDate, setStartDate] = useState(enrollment.start_date ?? "");
  const [price, setPrice] = useState(String(roundMoney(convertFromEur(enrollment.price, currency, rates), currency)));
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
  const { currency, rates } = useCurrency();
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
    if (product) setPrice(String(roundMoney(convertFromEur(product.price, currency, rates), currency)));
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

/**
 * "Появилися пакет курсов со скидкой. Но как клиентов определять по
 * потокам?" (Anastasiia, round 46) — a bundle of courses paid for as one
 * lump sum before every course's поток is known. Lists whatever package
 * sales already exist for this member (usually zero or one), each course
 * inside shown as either "Поток ещё не назначен" (pending — see
 * AssignPackageItemForm) or, once assigned, its date/price — it's a real
 * course enrollment by then too, same as a normal EnrollmentCard above (see
 * assignPackageItem in app/packages/actions.ts).
 */
function PackageSalesSection({
  memberId,
  packages,
  products,
  cohorts,
  canEdit,
  onChanged,
}: {
  memberId: string;
  packages: PackageSaleDetail[] | null;
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [selling, setSelling] = useState(false);
  const list = packages ?? [];

  if (!canEdit && list.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">{t("headingPackageSales")}</span>
        {canEdit && !selling && (
          <button
            type="button"
            onClick={() => setSelling(true)}
            className="text-xs font-medium text-ink-2 hover:underline"
          >
            {t("btnSellPackageShort")}
          </button>
        )}
      </div>

      {list.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {list.map((pkg) => (
            <PackageSaleCard key={pkg.id} pkg={pkg} cohorts={cohorts} canEdit={canEdit} onChanged={onChanged} />
          ))}
        </div>
      )}

      {selling && (
        <NewPackageSaleForm
          memberId={memberId}
          products={products}
          onCancel={() => setSelling(false)}
          onSaved={() => {
            setSelling(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function PackageSaleCard({
  pkg,
  cohorts,
  canEdit,
  onChanged,
}: {
  pkg: PackageSaleDetail;
  cohorts: Tables<"product_cohorts">[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const allAssigned = pkg.items.every((i) => i.enrollment_id);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deletePackageSale(pkg.id);
      if (res.error) setError(res.error);
      else onChanged();
    });
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{pkg.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="rounded-full bg-surface-3 px-2 py-0.5 font-medium text-ink-2">
              {t("packageBadgeLabel")}
            </span>
            <span>{pkg.paid_date}</span>
            <span className="text-ink-2">
              <Money amountEur={pkg.total_price} />
            </span>
          </div>
        </div>
        {canEdit && !allAssigned && (
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="shrink-0 text-xs text-accent-strong hover:underline disabled:opacity-50"
          >
            {pending ? "..." : t("delete")}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-accent-strong">{t(error)}</p>}

      <div className="mt-2 flex flex-col gap-1.5">
        {pkg.items.map((item) => (
          <div key={item.id} className="rounded-md bg-surface-2 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-ink-2">{item.product_name ?? t("optionCourseNotChosen")}</span>
              {item.enrollment_id ? (
                <span className="flex items-center gap-2 text-muted">
                  <span>{t("packageItemAssignedOn", { date: item.start_date ?? "" })}</span>
                  <span className="text-ink-2">
                    <Money amountEur={item.allocated_price ?? 0} />
                  </span>
                </span>
              ) : canEdit ? (
                assigningItemId === item.id ? null : (
                  <button
                    type="button"
                    onClick={() => setAssigningItemId(item.id)}
                    className="text-ink-2 hover:underline"
                  >
                    {t("btnAssignCohortShort")}
                  </button>
                )
              ) : (
                <span className="text-muted">{t("packageItemPending")}</span>
              )}
            </div>
            {assigningItemId === item.id && (
              <AssignPackageItemForm
                item={item}
                cohorts={cohorts}
                onCancel={() => setAssigningItemId(null)}
                onSaved={() => {
                  setAssigningItemId(null);
                  onChanged();
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignPackageItemForm({
  item,
  cohorts,
  onCancel,
  onSaved,
}: {
  item: PackageSaleDetail["items"][number];
  cohorts: Tables<"product_cohorts">[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { currency, rates } = useCurrency();
  const [startDate, setStartDate] = useState("");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const productCohorts = useMemo(
    () =>
      cohorts
        .filter((c) => c.product_id === item.product_id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [cohorts, item.product_id]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await assignPackageItem(item.id, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ink-2">{t("fieldCohortStart")}</span>
          {/* Round 53: a real list of this course's потоки (a <datalist> on a
              date input isn't shown by Safari/Chrome date pickers at all). */}
          {productCohorts.length > 0 ? (
            <select
              name="start_date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">—</option>
              {productCohorts.map((c) => (
                <option key={c.id} value={c.start_date}>
                  {c.start_date.split("-").reverse().join(".")}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ink-2">
            {t("fieldAllocatedPrice")} ({currencySymbol(currency)})
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <input
            type="hidden"
            name="allocated_price"
            value={String(convertToEur(parseFloat(price) || 0, currency, rates))}
          />
        </label>
      </div>
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("btnAssignShort")}
        </button>
      </div>
    </form>
  );
}

function NewPackageSaleForm({
  memberId,
  products,
  onCancel,
  onSaved,
}: {
  memberId: string;
  products: Tables<"products">[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { currency, rates } = useCurrency();
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(productId: string) {
    setSelected((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createPackageSale(memberId, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fieldPackageLabel")}</span>
          <input
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("placeholderPackageLabel")}
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fieldPackageCourses")}</span>
          <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  name="product_id"
                  value={p.id}
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-3.5 w-3.5"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">
              {t("fieldTotalPrice")} ({currencySymbol(currency)})
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <input
              type="hidden"
              name="total_price"
              value={String(convertToEur(parseFloat(totalPrice) || 0, currency, rates))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldPaidDate")}</span>
            <input
              name="paid_date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>
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
          disabled={pending || selected.length === 0}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : t("btnCreatePackageShort")}
        </button>
      </div>
    </form>
  );
}

/**
 * Shows this member's Контакт's other заявки (leads/inquiries) — the
 * reverse of LeadDetailModal's ContactHistorySection: her enrollments are
 * already visible above via EnrollmentsSection, so this only adds what
 * wasn't shown yet, per Anastasiia's point that neither card had this
 * before (11 сен 2026). Renders nothing when she has no other leads.
 */
function ContactLeadsSection({ detail }: { detail: MemberDetail | null }) {
  const { locale, t } = useLocale();
  const leads = detail?.contactHistory?.otherLeads ?? [];
  if (leads.length === 0) return null;

  return (
    <div className="mt-5 rounded-lg bg-surface-2 p-3">
      <span className="text-xs font-medium text-ink-2">{t("headingContactLeads")}</span>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-2">
        {leads.map((l) => (
          <li key={l.id}>
            {l.name} · {stageLabel(l.stage, locale)}
          </li>
        ))}
      </ul>
    </div>
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
