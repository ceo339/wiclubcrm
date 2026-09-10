"use client";

import { stageLabel, sourceLabel, declineReasonLabel } from "@/lib/leads";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Lead } from "./types";

export default function LeadsList({
  leads,
  showPartner,
  onSelect,
}: {
  leads: Lead[];
  showPartner: boolean;
  onSelect: (id: string) => void;
}) {
  const { locale, t } = useLocale();

  if (leads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        {t("emptyNoLeadsFiltered")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">{t("colName")}</th>
            {showPartner && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
            <th className="px-4 py-3 font-medium">{t("colSource")}</th>
            <th className="px-4 py-3 font-medium">{t("colStage")}</th>
            <th className="px-4 py-3 font-medium">{t("colAmount")}</th>
            <th className="px-4 py-3 font-medium">{t("colContacts")}</th>
            <th className="px-4 py-3 font-medium">{t("colAdded")}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
            >
              <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
              {showPartner && (
                <td className="px-4 py-3 text-muted">{lead.partner_name ?? "—"}</td>
              )}
              <td className="px-4 py-3 text-muted">
                {lead.source ? sourceLabel(lead.source, locale) : "—"}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                  {stageLabel(lead.stage, locale)}
                </span>
                {lead.stage === "declined" && lead.decline_reason && (
                  <div className="mt-0.5 text-xs text-muted">
                    {lead.decline_note || declineReasonLabel(lead.decline_reason, locale)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{lead.value ? <Money amountEur={lead.value} /> : "—"}</td>
              <td className="px-4 py-3 text-muted">
                {lead.phone || lead.email || "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {new Date(lead.added_date).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
