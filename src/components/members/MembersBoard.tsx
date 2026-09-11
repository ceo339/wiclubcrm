"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { STATUSES, statusLabel, statusPillClasses } from "@/lib/members";
import Money from "@/components/currency/Money";
import Avatar from "@/components/ui/Avatar";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Tables } from "@/types/database";
import type { Member } from "./types";
import NewMemberModal from "./NewMemberModal";
import MemberDetailModal from "./MemberDetailModal";

export default function MembersBoard({
  initialMembers,
  products,
  cohorts,
  isHq,
  canEdit,
}: {
  initialMembers: Member[];
  products: Tables<"products">[];
  cohorts: Tables<"product_cohorts">[];
  isHq: boolean;
  canEdit: boolean;
}) {
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [productId, setProductId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  // "?open=<id>" — same deep-link mechanism as LeadsBoard, for the home
  // page's "Мои задачи" widget.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    initialMembers.forEach((m) => {
      if (m.product_id && m.product_name) seen.set(m.product_id, m.product_name);
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initialMembers]);

  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    initialMembers.forEach((m) => {
      if (m.start_date) seen.add(m.start_date);
    });
    return Array.from(seen).sort();
  }, [initialMembers]);

  const hasActiveFilters =
    search.trim() !== "" || status !== "all" || productId !== "all" || startDate !== "all";

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setProductId("all");
    setStartDate("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialMembers.filter((m) => {
      if (status !== "all" && m.status !== status) return false;
      if (productId !== "all" && m.product_id !== productId) return false;
      if (startDate !== "all" && m.start_date !== startDate) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.city ?? "").toLowerCase().includes(q);
    });
  }, [initialMembers, search, status, productId, startDate]);

  const selected = initialMembers.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchMembersPlaceholder")}
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {statusLabel(s.id, locale)}
            </option>
          ))}
        </select>

        {productOptions.length > 0 && (
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="all">{t("allCourses")}</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {dateOptions.length > 0 && (
          <select
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="all">{t("allStartDates")}</option>
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-muted hover:text-ink-2"
          >
            {t("btnResetFilter")}
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="ml-auto rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnAddMemberShort")}
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("hqReadOnlyMembersBanner")}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoMembersFiltered")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colCourse")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colStart")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{m.name}</div>
                        <div className="truncate text-xs text-muted">
                          {m.city ?? "—"}
                          {m.member_since ? ` · ${t("sincePrefix", { date: m.member_since })}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  {isHq && <td className="px-4 py-3 text-muted">{m.partner_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted">{m.product_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClasses(m.status)}`}>
                      {statusLabel(m.status, locale)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{m.start_date ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {m.price_collected ? <Money amountEur={m.price_collected} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewMemberModal
          products={products}
          cohorts={cohorts}
          onClose={() => setShowNew(false)}
        />
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
