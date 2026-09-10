"use client";

import { useState } from "react";
import type { Tables } from "@/types/database";
import NewPartnerModal from "./NewPartnerModal";

export default function PartnersBoard({
  initialPartners,
}: {
  initialPartners: Tables<"partners">[];
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {initialPartners.length === 0
            ? "Клубов пока нет."
            : `Клубов в сети: ${initialPartners.length}`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + Клуб
        </button>
      </div>

      {initialPartners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          Пока нет ни одного клуба.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Клуб</th>
                <th className="px-4 py-3 font-medium">Страна</th>
                <th className="px-4 py-3 font-medium">Город</th>
                <th className="px-4 py-3 font-medium">Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {initialPartners.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.country ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{p.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(p.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPartnerModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
