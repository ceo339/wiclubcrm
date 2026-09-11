"use client";

import { useEffect, useState } from "react";
import { getCampaignRecipients, type RecipientDetail } from "@/app/email/actions";
import { recipientStatusLabelKey, recipientStatusPillClasses } from "@/lib/email";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * Who a campaign actually reached, by real name and email — clicking a
 * campaign row opens this instead of leaving "Кому" as just an audience
 * label with no way to see the people inside it.
 */
export default function CampaignRecipientsModal({
  campaignId,
  subject,
  onClose,
}: {
  campaignId: string;
  subject: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [state, setState] = useState<{
    loading: boolean;
    recipients: RecipientDetail[];
    error: string | null;
  }>({ loading: true, recipients: [], error: null });

  useEffect(() => {
    let cancelled = false;
    getCampaignRecipients(campaignId).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ loading: false, recipients: [], error: res.error });
      else setState({ loading: false, recipients: res.recipients, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">{subject}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-muted hover:text-foreground"
          >
            {t("close")}
          </button>
        </div>

        <div className="mt-4">
          {state.loading ? (
            <p className="text-sm text-muted">{t("loading")}</p>
          ) : state.error ? (
            <p className="text-sm text-accent-strong">{t(state.error)}</p>
          ) : state.recipients.length === 0 ? (
            <p className="text-sm text-muted">{t("emptyNoRecipients")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("colName")}</th>
                  <th className="py-2 pr-3 font-medium">{t("fieldEmail")}</th>
                  <th className="py-2 text-right font-medium">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {state.recipients.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-foreground">{r.name}</td>
                    <td className="py-2 pr-3 text-muted">{r.email}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${recipientStatusPillClasses(r.status)}`}
                      >
                        {t(recipientStatusLabelKey(r.status))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
