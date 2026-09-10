"use client";

import { useMemo, useState } from "react";
import { STATUSES, statusLabel } from "@/lib/members";
import type { Tables } from "@/types/database";
import type { Member } from "./types";
import NewMemberModal from "./NewMemberModal";
import MemberDetailModal from "./MemberDetailModal";

export default function MembersBoard({
  initialMembers,
  products,
  isHq,
  canEdit,
}: {
  initialMembers: Member[];
  products: Tables<"products">[];
  isHq: boolean;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialMembers.filter((m) => {
      if (status !== "all" && m.status !== status) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.city ?? "").toLowerCase().includes(q);
    });
  }, [initialMembers, search, status]);

  const selected = initialMembers.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, городу…"
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">Все статусы</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="ml-auto rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            + Участница
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Режим HQ: видны участницы всех клубов сети, доступно только для просмотра.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          Участниц по этим фильтрам не найдено.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Имя</th>
                {isHq && <th className="px-4 py-3 font-medium">Клуб</th>}
                <th className="px-4 py-3 font-medium">Курс</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Город</th>
                <th className="px-4 py-3 font-medium">Начало</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                  {isHq && <td className="px-4 py-3 text-muted">{m.partner_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted">{m.product_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                      {statusLabel(m.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{m.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{m.start_date ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {m.price_collected ? `€${m.price_collected}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewMemberModal products={products} onClose={() => setShowNew(false)} />
      )}
      {selected && (
        <MemberDetailModal
          key={selected.id}
          member={selected}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
