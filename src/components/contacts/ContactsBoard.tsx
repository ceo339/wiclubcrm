"use client";

import { useMemo, useState } from "react";
import { stageLabel } from "@/lib/leads";
import { statusLabel } from "@/lib/members";
import Avatar from "@/components/ui/Avatar";
import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import MultiSelectFilter, { type MultiSelectOption } from "@/components/leads/MultiSelectFilter";
import { contactPaidTotal, type Contact } from "./types";
import ContactDetailModal from "./ContactDetailModal";
import ImportContactsModal from "./ImportContactsModal";

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
  // Round 29 — "сделай как на «Лидах»/«Когортах»" (Anastasiia, 17 сен
  // 2026): она уже спрашивала эти фильтры в раунде 6 (обычные одиночные
  // <select>), но с тех пор источник/кампания на «Лидах» и «Когортах»
  // переехали на чекбокс-мультивыбор (MultiSelectFilter, раунд 21) — курс и
  // поток здесь переведены на тот же компонент для единообразия. Пустой
  // набор — по-прежнему "показать всё", та же конвенция, что и везде.
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [streamDates, setStreamDates] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // "в контактах нужны фильтры по курсам и потокам" (Anastasiia, 11 сен
  // 2026) — a contact's course can come either from an actual course
  // enrollment (she's a participant) or from a заявка that already named a
  // course/stream (she hasn't converted yet), so both are combined here.
  const courseOptions: MultiSelectOption[] = useMemo(() => {
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
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [initialContacts]);

  const streamOptions: MultiSelectOption[] = useMemo(() => {
    const seen = new Set<string>();
    initialContacts.forEach((c) => {
      c.leads.forEach((l) => {
        if (!l.cohort_start_date) return;
        if (courseIds.size > 0 && (!l.product_id || !courseIds.has(l.product_id))) return;
        seen.add(l.cohort_start_date);
      });
      c.enrollments.forEach((e) => {
        if (!e.start_date) return;
        if (courseIds.size > 0 && (!e.product_id || !courseIds.has(e.product_id))) return;
        seen.add(e.start_date);
      });
    });
    return Array.from(seen)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [initialContacts, courseIds]);

  function handleCourseChange(next: Set<string>) {
    setCourseIds(next);
    // те же соображения, что и раньше в handleProductChange: выбранные
    // потоки могли принадлежать курсу, который только что убрали из
    // фильтра — сбрасываем, а не оставляем невидимый активный фильтр.
    setStreamDates(new Set());
  }

  const hasActiveFilters = search.trim() !== "" || courseIds.size > 0 || streamDates.size > 0;

  function resetFilters() {
    setSearch("");
    setCourseIds(new Set());
    setStreamDates(new Set());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialContacts.filter((c) => {
      if (courseIds.size > 0) {
        const matches =
          c.leads.some((l) => l.product_id && courseIds.has(l.product_id)) ||
          c.enrollments.some((e) => e.product_id && courseIds.has(e.product_id));
        if (!matches) return false;
      }
      if (streamDates.size > 0) {
        const matches =
          c.leads.some((l) => l.cohort_start_date && streamDates.has(l.cohort_start_date)) ||
          c.enrollments.some((e) => e.start_date && streamDates.has(e.start_date));
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
  }, [initialContacts, search, courseIds, streamDates]);

  const selected = initialContacts.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchContactsPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent sm:w-64"
        />

        {courseOptions.length > 0 && (
          <MultiSelectFilter
            allLabel={t("allCourses")}
            options={courseOptions}
            selected={courseIds}
            onChange={handleCourseChange}
          />
        )}

        {streamOptions.length > 0 && (
          <MultiSelectFilter
            allLabel={t("allStartDates")}
            options={streamOptions}
            selected={streamDates}
            onChange={setStreamDates}
          />
        )}

        {hasActiveFilters && (
          <button type="button" onClick={resetFilters} className="text-sm text-muted hover:text-ink-2">
            {t("btnResetFilter")}
          </button>
        )}

        {/* "нужно добавить функцию импорта контактов, тогда не будет
            путаницы, я буду импортировать контакты, а не лиды" (Anastasiia,
            13 сен 2026) — same canEdit gate LeadsBoard's own Импорт button
            uses (canEdit is already false for hq, which has no partner_id
            to import into). */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="ml-auto rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("btnImport")}
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
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3 text-right font-medium">№</th>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colLeadsShort")}</th>
                <th className="px-4 py-3 font-medium">{t("navCourses")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colPaidTotal")}</th>
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
                  <td className="px-4 py-3 text-right text-ink-2">
                    {contactPaidTotal(c.enrollments) > 0 ? (
                      <Money amountEur={contactPaidTotal(c.enrollments)} />
                    ) : (
                      <span className="text-muted">—</span>
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

      {showImport && <ImportContactsModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
