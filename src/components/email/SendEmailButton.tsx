"use client";

import { useState, useTransition } from "react";
import { sendDirectEmail } from "@/app/email/actions";
import { useT } from "@/components/i18n/LocaleProvider";

/**
 * "Написать письмо" from a lead/member's own card — the gap Anastasia
 * flagged after comparing to the prototype. Not shown at all when there's
 * no email on file, same as ConvertToMemberButton only showing once a lead
 * is actually at "Оплата": no point offering an action that can't work.
 */
export default function SendEmailButton({
  entityType,
  entityId,
  email,
}: {
  entityType: "lead" | "member";
  entityId: string;
  email: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!email) return null;

  if (sent) {
    return <p className="text-xs text-muted">{t("emailSentToRecipient")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
      >
        {t("btnWriteEmail")}
      </button>
    );
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const subject = String(formData.get("subject") || "");
      const body = String(formData.get("body") || "");
      const res = await sendDirectEmail(entityType, entityId, subject, body);
      if (res.error) setError(res.error);
      else setSent(true);
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-border p-3"
    >
      <input
        name="subject"
        required
        placeholder={t("fieldSubject")}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <textarea
        name="body"
        required
        rows={5}
        placeholder={t("fieldBody")}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      {error && <p className="text-xs text-accent-strong">{t(error)}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? t("sendingCampaign") : t("btnSendCampaign")}
        </button>
      </div>
    </form>
  );
}
