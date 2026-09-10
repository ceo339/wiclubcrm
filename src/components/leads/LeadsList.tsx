import { stageLabel, SOURCE_LABELS, declineReasonLabel } from "@/lib/leads";
import Money from "@/components/currency/Money";
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
  if (leads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        Лидов по этим фильтрам не найдено.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Имя</th>
            {showPartner && <th className="px-4 py-3 font-medium">Клуб</th>}
            <th className="px-4 py-3 font-medium">Источник</th>
            <th className="px-4 py-3 font-medium">Стадия</th>
            <th className="px-4 py-3 font-medium">Сумма</th>
            <th className="px-4 py-3 font-medium">Контакты</th>
            <th className="px-4 py-3 font-medium">Добавлен</th>
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
                {SOURCE_LABELS[lead.source ?? ""] ?? lead.source ?? "—"}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                  {stageLabel(lead.stage)}
                </span>
                {lead.stage === "declined" && lead.decline_reason && (
                  <div className="mt-0.5 text-xs text-muted">
                    {lead.decline_note || declineReasonLabel(lead.decline_reason)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{lead.value ? <Money amountEur={lead.value} /> : "—"}</td>
              <td className="px-4 py-3 text-muted">
                {lead.phone || lead.email || "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {new Date(lead.added_date).toLocaleDateString("ru-RU")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
