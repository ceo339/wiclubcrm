"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Tables } from "@/types/database";
import NewPartnerModal from "./NewPartnerModal";
import EditPartnerModal from "./EditPartnerModal";

export default function PartnersBoard({
  initialPartners,
}: {
  initialPartners: Tables<"partners">[];
}) {
  const { locale, t } = useLocale();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPartner = initialPartners.find((p) => p.id === editingId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {initialPartners.length === 0
            ? t("emptyNoClubsShort")
            : t("clubsInNetworkCountLabel", { n: initialPartners.length })}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          {t("btnAddClubShort")}
        </button>
      </div>

      {initialPartners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoClubsAtAll")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colClub")}</th>
                <th className="px-4 py-3 font-medium">{t("fieldCountry")}</th>
                <th className="px-4 py-3 font-medium">{t("fieldCity")}</th>
                <th className="px-4 py-3 font-medium">{t("colAdded")}</th>
              </tr>
            </thead>
            <tbody>
              {initialPartners.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setEditingId(p.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.country ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{p.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(p.created_at).toLocaleDateString(locale === "bg" ? "bg-BG" : "ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPartnerModal onClose={() => setShowNew(false)} />}
      {editingPartner && (
        <EditPartnerModal partner={editingPartner} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
