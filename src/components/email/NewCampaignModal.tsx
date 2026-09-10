"use client";

import { useActionState, useEffect, useState } from "react";
import { createAndSendCampaign, previewAudience, type ActionResult } from "@/app/email/actions";
import { AUDIENCES, type CampaignAudience } from "@/lib/email";
import { useLocale } from "@/components/i18n/LocaleProvider";

const initialState: ActionResult = { error: null };

export default function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await createAndSendCampaign(formData);
      if (!result.error) onClose();
      return result;
    },
    initialState
  );

  const [audience, setAudience] = useState<CampaignAudience>("members");
  const [preview, setPreview] = useState<
    { audience: CampaignAudience; count: number; skippedNoEmail: number } | null
  >(null);

  // `preview` carries the audience it was computed for, so staleness (and
  // therefore the loading state) is derived rather than tracked as its own
  // bit of state that could fall out of sync with it.
  const previewLoading = preview === null || preview.audience !== audience;

  useEffect(() => {
    let cancelled = false;
    previewAudience(audience).then((res) => {
      if (cancelled || "error" in res) return;
      setPreview({ audience, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
      >
        <h3 className="text-base font-semibold text-foreground">{t("headingNewCampaign")}</h3>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldAudience")}</span>
            <select
              name="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as CampaignAudience)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>
                  {t(a.labelKey)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              {previewLoading
                ? t("audiencePreviewLoading")
                : preview
                  ? [
                      t("audiencePreviewCount", { n: preview.count }),
                      preview.skippedNoEmail > 0
                        ? t("audiencePreviewSkipped", { n: preview.skippedNoEmail })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null}
            </p>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldSubject")}</span>
            <input
              name="subject"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldBody")}</span>
            <textarea
              name="body"
              required
              rows={8}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>

        {state.error && (
          <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
            {t(state.error)}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending || previewLoading || (preview?.count ?? 0) === 0}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? t("sendingCampaign") : t("btnSendCampaign")}
          </button>
        </div>
      </form>
    </div>
  );
}
