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
}: {
  initialContacts: Contact[];
  isHq: boolean;
}) {
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialContacts;
    return initialContacts.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialContacts, search]);

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
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t("hqReadOnlyContactsBanner")}</p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoContacts")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colLeadsShort")}</th>
                <th className="px-4 py-3 font-medium">{t("navCourses")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
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

      {selected && <ContactDetailModal contact={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
