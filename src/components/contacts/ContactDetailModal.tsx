"use client";

import { stageLabel } from "@/lib/leads";
import { statusLabel } from "@/lib/members";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Contact } from "./types";

/**
 * Read-only — a Контакт's shared fields are edited from her Lead/Member
 * card (which mirrors onto this same contacts row, see updateLead/
 * updateMember), not from here. This is purely the "see everything about
 * this person in one place" view Anastasiia asked for.
 */
export default function ContactDetailModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { locale, t } = useLocale();

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

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t("fieldPhone")}</dt>
          <dd className="text-ink-2">{contact.phone ?? "—"}</dd>
          <dt className="text-muted">{t("fieldEmail")}</dt>
          <dd className="text-ink-2">{contact.email ?? "—"}</dd>
          {contact.birthday && (
            <>
              <dt className="text-muted">{t("fieldBirthday")}</dt>
              <dd className="text-ink-2">{contact.birthday}</dd>
            </>
          )}
        </dl>

        <div className="mt-5">
          <span className="text-xs font-medium text-ink-2">{t("colLeadsShort")}</span>
          {contact.leads.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("emptyNoInquiries")}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {contact.leads.map((l) => (
                <div key={l.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{l.product_name ?? t("optionCourseNotChosen")}</span>
                    <span className="text-xs text-muted">{stageLabel(l.stage, locale)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{l.added_date}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <span className="text-xs font-medium text-ink-2">{t("navCourses")}</span>
          {contact.enrollments.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("emptyNoCoursesForMember")}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {contact.enrollments.map((e) => (
                <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{e.product_name ?? t("optionCourseNotChosen")}</span>
                    <span className="text-xs text-muted">{statusLabel(e.status, locale)}</span>
                  </div>
                  {e.start_date && <div className="mt-1 text-xs text-muted">{e.start_date}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
