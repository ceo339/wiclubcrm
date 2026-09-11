"use client";

import { useState } from "react";
import type { Tables } from "@/types/database";
import { audienceLabelKey, computeCampaignStats } from "@/lib/email";
import { useLocale } from "@/components/i18n/LocaleProvider";
import NewCampaignModal from "./NewCampaignModal";

type Campaign = Tables<"email_campaigns"> & {
  email_campaign_recipients: { status: string }[];
};

/**
 * The list-size tile and the compose modal's live preview both read the
 * same real counts — nothing here is a cached/precomputed subscriber list,
 * it's just "how many leads/members currently have an email on file".
 */
export default function EmailBoard({
  campaigns,
  canEdit,
  listSize,
}: {
  campaigns: Campaign[];
  canEdit: boolean;
  listSize: { members: number; leadsAll: number };
}) {
  const { locale, t } = useLocale();
  const [showNew, setShowNew] = useState(false);
  const dateLocale = locale === "bg" ? "bg-BG" : "ru-RU";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-xl border border-border bg-background shadow-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">{t("statListSize")}</div>
          <div
            className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {listSize.members + listSize.leadsAll}
          </div>
          <div className="mt-1 text-xs text-muted">
            {t("deltaListBreakdown", { members: listSize.members, leads: listSize.leadsAll })}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnNewCampaign")}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t("cLetters")}</h2>
        </div>
        {campaigns.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("emptyNoCampaigns")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">{t("colSubject")}</th>
                  <th className="px-5 py-3 font-medium">{t("colAudience")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("colRecipients")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("colOpenedPct")}</th>
                  <th className="px-5 py-3 text-right font-medium">{t("colClickedPct")}</th>
                  <th className="px-5 py-3 font-medium">{t("colSentDate")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const stats = computeCampaignStats(c.email_campaign_recipients);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-5 py-3 font-medium text-foreground">{c.subject}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                          {t(audienceLabelKey(c.audience))}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-muted">{stats.recipientsCount}</td>
                      <td className="px-5 py-3 text-right text-muted">
                        {c.status === "sending"
                          ? t("sendingCampaign")
                          : stats.openedPct === null
                            ? t("dash")
                            : `${stats.openedPct}%`}
                      </td>
                      <td className="px-5 py-3 text-right text-muted">
                        {stats.clickedPct === null ? t("dash") : `${stats.clickedPct}%`}
                      </td>
                      <td className="px-5 py-3">
                        {c.status === "failed" ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                            {t("campaignStatusFailed")}
                          </span>
                        ) : c.sent_at ? (
                          <span className="text-muted">{new Date(c.sent_at).toLocaleDateString(dateLocale)}</span>
                        ) : (
                          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                            {t("campaignStatusSending")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
