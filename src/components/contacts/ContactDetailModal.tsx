"use client";

import { useEffect, useState, useTransition } from "react";
import { COUNTRIES, stageLabel } from "@/lib/leads";
import { STATUSES, statusLabel } from "@/lib/members";
import { updateEnrollment } from "@/app/members/actions";
import Money from "@/components/currency/Money";
import MoneyAmountField from "@/components/currency/MoneyAmountField";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { addContactComment, getContactDetail, updateContact, type ContactDetail } from "@/app/contacts/actions";
import { contactPaidTotal, type Contact, type ContactEnrollment } from "./types";

/**
 * "контакты нужно редактировать должна быть вся информация в карточке
 * контакта по курсам, заявкам, комментариям" (Anastasiia, 11 сен 2026) —
 * this card now edits the contact's own fields directly (mirrored onto her
 * leads/member row, see updateContact) and shows her full history: every
 * заявка, every course, and every comment left on any of those cards,
 * aggregated in one place (see getContactDetail).
 */
export default function ContactDetailModal({
  contact,
  canEdit,
  onClose,
}: {
  contact: Contact;
  canEdit: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [editing, setEditing] = useState(false);
  // "не работает оплата и изменения курсов в контактах" (Anastasiia, 14 сен
  // 2026) — updateEnrollment was saving correctly (syncEnrollmentPayment
  // included), but this card renders straight off the `contact` prop (fed
  // once from the page's initial data), so a save inside this modal never
  // showed up here — she had to reload the whole page to see it. Local
  // state patched from the save response fixes that without a round trip,
  // matching what MemberDetailModal already does for its own enrollments.
  const [enrollments, setEnrollments] = useState(contact.enrollments);

  function handleEnrollmentSaved(updated: { id: string; status: string; start_date: string | null; price: number }) {
    setEnrollments((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
  }

  useEffect(() => {
    let cancelled = false;
    getContactDetail(contact.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    getContactDetail(contact.id).then(setDetail);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{contact.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {contact.city ?? "—"}
              {contact.member_since ? ` · ${t("sincePrefix", { date: contact.member_since })}` : ""}
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
          <EditForm contact={contact} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <ReadView contact={contact} canEdit={canEdit} onEdit={() => setEditing(true)} />
        )}

        <div className="mt-5">
          <span className="text-xs font-medium text-ink-2">{t("colLeadsShort")}</span>
          {contact.leads.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("emptyNoInquiries")}</p>
          ) : (
            <ContactLeadsList contact={contact} />
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-2">{t("navCourses")}</span>
            {/* "показывать оплату каждого курса и общую за контакт"
                (Anastasiia, 16 сен 2026) — каждый курс уже показывает свою
                цену ниже; здесь только сумма по-настоящему оплаченных
                курсов (sPaid/sCompleted), см. contactPaidTotal. */}
            {enrollments.length > 0 && (
              <span className="text-xs text-muted">
                {t("contactPaidTotalLabel")}: <Money amountEur={contactPaidTotal(enrollments)} />
              </span>
            )}
          </div>
          {enrollments.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("emptyNoCoursesForMember")}</p>
          ) : (
            <ContactEnrollmentsList enrollments={enrollments} canEdit={canEdit} onSaved={handleEnrollmentSaved} />
          )}
        </div>

        <CommentsSection contactId={contact.id} detail={detail} canEdit={canEdit} onChanged={refresh} />
      </div>
    </div>
  );
}

function ReadView({
  contact,
  canEdit,
  onEdit,
}: {
  contact: Contact;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{t("fieldPhone")}</dt>
        <dd className="text-ink-2">{contact.phone ?? "—"}</dd>
        <dt className="text-muted">{t("fieldEmail")}</dt>
        <dd className="text-ink-2">{contact.email ?? "—"}</dd>
        <dt className="text-muted">{t("fieldCountry")}</dt>
        <dd className="text-ink-2">{contact.country ?? "—"}</dd>
        <dt className="text-muted">{t("fieldCity")}</dt>
        <dd className="text-ink-2">{contact.city ?? "—"}</dd>
        {contact.birthday && (
          <>
            <dt className="text-muted">{t("fieldBirthday")}</dt>
            <dd className="text-ink-2">{contact.birthday}</dd>
          </>
        )}
      </dl>

      {canEdit && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("edit")}
          </button>
        </div>
      )}
    </>
  );
}

function EditForm({
  contact,
  onCancel,
  onSaved,
}: {
  contact: Contact;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateContact(contact.id, formData);
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
          defaultValue={contact.name}
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldPhone")}</span>
        <input
          name="phone"
          type="tel"
          defaultValue={contact.phone ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldCountry")}</span>
        <select
          name="country"
          defaultValue={contact.country ?? ""}
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
          defaultValue={contact.city ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldEmail")}</span>
        <input
          name="email"
          type="email"
          defaultValue={contact.email ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">{t("fieldBirthday")}</span>
        <input
          name="birthday"
          type="date"
          defaultValue={contact.birthday ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(error)}</p>}

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

function ContactLeadsList({ contact }: { contact: Contact }) {
  const { locale, t } = useLocale();
  return (
    <div className="mt-2 flex flex-col gap-2">
      {contact.leads.map((l) => (
        <div key={l.id} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{l.product_name ?? t("optionCourseNotChosen")}</span>
            <span className="text-xs text-muted">{stageLabel(l.stage, locale)}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {l.added_date}
            {l.cohort_start_date ? ` · ${t("colStartDate")}: ${l.cohort_start_date}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * "нет возможности редактировать курсы" (Anastasiia, 14 сен 2026) — the
 * card used to only ever show enrollments read-only, forcing a trip to the
 * full carточка участницы just to fix a status/дата/сумма. Reuses the same
 * updateEnrollment server action MemberDetailModal already calls — one
 * source of truth for what an edit does (idempotent payment sync included),
 * just a lighter inline form here instead of that modal's full layout.
 */
function ContactEnrollmentsList({
  enrollments,
  canEdit,
  onSaved,
}: {
  enrollments: ContactEnrollment[];
  canEdit: boolean;
  onSaved: (updated: { id: string; status: string; start_date: string | null; price: number }) => void;
}) {
  const { locale, t } = useLocale();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-col gap-2">
      {enrollments.map((e) =>
        editingId === e.id ? (
          <EditEnrollmentForm
            key={e.id}
            enrollment={e}
            onCancel={() => setEditingId(null)}
            onSaved={(updated) => {
              setEditingId(null);
              onSaved(updated);
            }}
          />
        ) : (
          <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{e.product_name ?? t("optionCourseNotChosen")}</span>
              <span className="text-xs text-muted">{statusLabel(e.status, locale)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span>{e.start_date ?? "—"}</span>
              <span>{e.price ? <Money amountEur={e.price} /> : "—"}</span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingId(e.id)}
                className="mt-2 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2"
              >
                {t("edit")}
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

function EditEnrollmentForm({
  enrollment,
  onCancel,
  onSaved,
}: {
  enrollment: ContactEnrollment;
  onCancel: () => void;
  onSaved: (updated: { id: string; status: string; start_date: string | null; price: number }) => void;
}) {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState(enrollment.status);
  const [startDate, setStartDate] = useState(enrollment.start_date ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateEnrollment(enrollment.id, formData);
      if (res.error) setError(res.error);
      else {
        onSaved({
          id: enrollment.id,
          status: String(formData.get("status") || enrollment.status),
          start_date: String(formData.get("start_date") || "").trim() || null,
          price: Number(formData.get("price")) || 0,
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-border p-3">
      <div className="text-sm font-medium text-foreground">{enrollment.product_name ?? t("optionCourseNotChosen")}</div>
      <div className="mt-2 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("colStatus")}</span>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>
        <MoneyAmountField label={t("fieldAmount")} name="price" defaultAmountEur={enrollment.price ?? 0} />
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

function CommentsSection({
  contactId,
  detail,
  canEdit,
  onChanged,
}: {
  contactId: string;
  detail: ContactDetail | null;
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
      const res = await addContactComment(contactId, text);
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
