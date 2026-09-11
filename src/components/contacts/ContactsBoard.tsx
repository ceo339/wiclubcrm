"use client";

import { useMemo, useState } from "react";
import { stageLabel } from "@/lib/leads";
import { statusLabel } from "@/lib/members";
import Avatar from "@/components/ui/Avatar";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Contact } from "./types";
import ContactDetailModal from "./ContactDetailModal";

export default function ContactsBoard({
  initialContacts,
  isHq,
  canEdit,
}: {
  initialContacts: Contact[];
  isHq: boolean;
  canEdit: boolean;
}) {
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // "в контактах нужны фильтры по курсам и потокам" (Anastasiia, 11 сен
  // 2026) — a contact's course can come either from an actual course
  // enrollment (she's a participant) or from a заявка that already named a
  // course/stream (she hasn't converted yet), so both are combined here.
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    initialContacts.forEach((c) => {
      c.leads.forEach((l) => {
        if (l.product_id && l.product_name) seen.set(l.product_id, l.product_name);
      });
      c.enrollments.forEach((e) => {
        if (e.product_id && e.product_name) seen.set(e.product_id, e.product_name);
      });
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initialContacts]);

  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    initialContacts.forEach((c) => {
      c.leads.forEach((l) => {
        if (!l.cohort_start_date) return;
        if (productId !== "all" && l.product_id !== productId) return;
        seen.add(l.cohort_start_date);
      });
      c.enrollments.forEach((e) => {
        if (!e.start_date) return;
        if (productId !== "all" && e.product_id !== productId) return;
        seen.add(e.start_date);
      });
    });
    return Array.from(seen).sort();
  }, [initialContacts, productId]);

  function handleProductChange(id: string) {
    setProductId(id);
    setStartDate("all");
  }

  const hasActiveFilters = search.trim() !== "" || productId !== "all" || startDate !== "all";

  function resetFilters() {
    setSearch("");
    setProductId("all");
    setStartDate("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialContacts.filter((c) => {
      if (productId !== "all") {
        const matches =
          c.leads.some((l) => l.product_id === productId) || c.enrollments.some((e) => e.product_id === productId);
        if (!matches) return false;
      }
      if (startDate !== "all") {
        const matches =
          c.leads.some((l) => l.cohort_start_date === startDate) ||
          c.enrollments.some((e) => e.start_date === startDate);
        if (!matches) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialContacts, search, productId, startDate]);

  const selected = initialContacts.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchContactsPlaceholder")}
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />

        {productOptions.length > 0 && (
          <select
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
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
          <button type="button" onClick={resetFilters} className="text-sm text-muted hover:text-ink-2">
            {t("btnResetFilter")}
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t("hqReadOnlyContactsBanner")}</p>
      )}

      {/* "должен быть виджет всего контактов" (Anastasiia, 11 сен 2026) */}
      <p className="text-sm font-medium text-ink-2">{t("countTotalContacts", { count: String(filtered.length) })}</p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoContacts")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3 text-right font-medium">№</th>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colLeadsShort")}</th>
                <th className="px-4 py-3 font-medium">{t("navCourses")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, index) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 text-right text-muted">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{c.name}</div>
                        <div className="truncate text-xs text-muted">
                          {c.phone || c.email || c.city || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  {isHq && <td className="px-4 py-3 text-muted">{c.partner_name ?? "—"}</td>}
                  <td className="px-4 py-3">
                    {c.leads.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {c.leads.map((l) => (
                          <span key={l.id} className="text-ink-2">
                            {l.product_name ?? t("optionCourseNotChosen")} · {stageLabel(l.stage, locale)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.enrollments.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {c.enrollments.map((e) => (
                          <span key={e.id} className="text-ink-2">
                            {e.product_name ?? t("optionCourseNotChosen")} · {statusLabel(e.status, locale)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ContactDetailModal contact={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
