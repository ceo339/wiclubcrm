"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { STATUSES, statusLabel, statusPillClasses } from "@/lib/members";
import Money from "@/components/currency/Money";
import { localOf, sumLocal, type LocalAmount } from "@/lib/currency";
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
  // Round 58 — «Нужно выбрать поток» filter chip (paid via the bank, no поток yet).
  // Round 59: also opened pre-filtered from Главная «Требует внимания» (?needsCohort=1).
  const searchParams = useSearchParams();
  const [needsCohortOnly, setNeedsCohortOnly] = useState(() => searchParams.get("needsCohort") === "1");
  const [showNew, setShowNew] = useState(false);
  // "?open=<id>" — same deep-link mechanism as LeadsBoard, for the home
  // page's "Мои задачи" widget.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
  // Same fix as LeadsBoard — see the comment there. Without this, a second
  // "Мои задачи" click on this page (participant tasks) landed on the board
  // with nothing auto-opened whenever the component wasn't remounted fresh.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setSelectedId(openId);
  }, [searchParams]);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    initialMembers.forEach((m) => {
      m.enrollments.forEach((e) => {
        if (e.product_id && e.product_name) seen.set(e.product_id, e.product_name);
      });
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initialMembers]);

  // "в участницах, если выбрать мк чувственность, то появился поток с курса
  // сф0 25.08. А в карточке курса в МК чувственность нет этого старта"
  // (Anastasiia, 11 сен 2026) — this used to list every start date across
  // every course regardless of which course was selected above. Now it
  // only offers dates that actually belong to the selected course.
  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    initialMembers.forEach((m) => {
      m.enrollments.forEach((e) => {
        if (!e.start_date) return;
        if (productId !== "all" && e.product_id !== productId) return;
        seen.add(e.start_date);
      });
    });
    return Array.from(seen).sort();
  }, [initialMembers, productId]);

  function handleProductChange(id: string) {
    setProductId(id);
    // A stream date picked for the previous course rarely belongs to the
    // new one — reset it rather than silently filtering to zero rows.
    setStartDate("all");
  }

  const hasActiveFilters =
    search.trim() !== "" || status !== "all" || productId !== "all" || startDate !== "all" || needsCohortOnly;

  const needsCohortCount = useMemo(
    () => initialMembers.filter((m) => m.enrollments.some((e) => e.needs_cohort)).length,
    [initialMembers]
  );

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setProductId("all");
    setStartDate("all");
    setNeedsCohortOnly(false);
  }

  // "показаны оплаты за другие курсы, хотя я выбрала 1 поток" (Anastasiia,
  // 13 сен 2026) — status/course/поток used to be matched independently,
  // so a member could pass the filter with e.g. one enrollment matching the
  // chosen course and a completely different enrollment matching the
  // chosen поток date — a false match for a member who isn't actually in
  // that course+поток combination at all. `matchingEnrollments` requires
  // ONE AND THE SAME enrollment to satisfy every active filter at once —
  // this is also what the table below now renders instead of the member's
  // full course history, so a filtered view only ever shows the course
  // that was actually filtered for.
  const hasEnrollmentFilter = status !== "all" || productId !== "all" || startDate !== "all" || needsCohortOnly;
  function matchingEnrollments(m: Member) {
    return m.enrollments.filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (productId !== "all" && e.product_id !== productId) return false;
      if (startDate !== "all" && e.start_date !== startDate) return false;
      if (needsCohortOnly && !e.needs_cohort) return false;
      return true;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialMembers.filter((m) => {
      if (hasEnrollmentFilter && matchingEnrollments(m).length === 0) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.city ?? "").toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMembers, search, status, productId, startDate, needsCohortOnly]);

  // "не нужно считать тех, кто не был в виджетах. только те, кто в
  // статусе оплаты, а те, кто не был удалить из статистик" (Anastasiia, 2
  // окт 2026) — the headline count and "Оплатили X из Y" used to be based
  // on every matching enrollment regardless of status, so a поток with 12
  // "Не была на курсе" rows (sNoShow, price zeroed out — see round 53) and
  // 5 real paying участниц showed up as "17", which read as if 17 people
  // were actually in the course. These two widgets (below the filter bar,
  // once a course is picked) now only count enrollments that are actually
  // in a payment status — sPartial/sPaid/sCompleted — so sNoShow (and
  // sAwaiting/sCancelled/sRefunded/sFailed) never inflate them. The table
  // below is untouched: picking "Не была на курсе" in the Статус filter
  // still lists those rows, same as before.
  // 2 Oct 2026 (Anastasiia): «Записалась · не оплатила» counts too — only
  // «Не была на курсе» / cancelled / refunded / failed are left out.
  const PAYMENT_STATUSES = ["sAwaiting", "sPartial", "sPaid", "sCompleted"];
  function hasPaymentStatus(m: Member) {
    return matchingEnrollments(m).some((e) => PAYMENT_STATUSES.includes(e.status));
  }

  const statsFiltered = useMemo(() => {
    if (productId === "all") return filtered;
    return filtered.filter(hasPaymentStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, productId]);

  // "нужен виджет кол-во участниц на выбранный курс, поток" (Anastasiia,
  // 11 сен 2026) — a plain-language readout of how many rows the current
  // course/stream filters actually match, since counting table rows by eye
  // gets unreliable once a list is long.
  const countLabel = useMemo(() => {
    const courseName = productId !== "all" ? productOptions.find((p) => p.id === productId)?.name ?? "" : "";
    if (productId !== "all" && startDate !== "all") {
      return t("countInStream", { course: courseName, date: startDate, count: String(statsFiltered.length) });
    }
    if (productId !== "all") {
      return t("countInCourse", { course: courseName, count: String(statsFiltered.length) });
    }
    return t("countTotalMembers", { count: String(filtered.length) });
  }, [productId, startDate, statsFiltered.length, filtered.length, productOptions, t]);

  // "сверху писать сколько чел. столько оплачено, какая итого сумма"
  // (Anastasiia, 13 сен 2026) — once a specific course is selected, add the
  // three numbers she actually wants at a glance: how many people are in
  // this course/поток, how many of them have actually paid (sPaid or
  // sCompleted — a finished course was paid for first), and the real money
  // collected from them. Deliberately scoped to the SAME matching
  // enrollment as the table rows below (see matchingEnrollments), not the
  // member's whole history, for the same reason as that fix. Base set is
  // statsFiltered (see above) so sNoShow/sAwaiting rows don't count here either.
  const streamStats = useMemo(() => {
    if (productId === "all") return null;
    let paidCount = 0;
    let totalSum = 0;
    const locals: (LocalAmount | null)[] = [];
    statsFiltered.forEach((m) => {
      const paidEnrollments = matchingEnrollments(m).filter(
        (e) => e.status === "sPaid" || e.status === "sCompleted"
      );
      if (paidEnrollments.length > 0) paidCount += 1;
      totalSum += paidEnrollments.reduce((sum, e) => sum + Number(e.price), 0);
      paidEnrollments.forEach((e) => locals.push(localOf(e.price_local, e.local_currency)));
    });
    // Round 56: in lari, the sum of what was typed (12 × 35 = 420, not 418).
    return { paidCount, totalSum, totalLocal: sumLocal(locals) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsFiltered, productId, startDate, status]);

  const selected = initialMembers.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchMembersPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent sm:w-64"
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

        {(needsCohortCount > 0 || needsCohortOnly) && (
          <button
            type="button"
            onClick={() => setNeedsCohortOnly((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              needsCohortOnly
                ? "border-warn bg-warn-soft text-warn"
                : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            {t("filterNeedsCohort", { count: String(needsCohortCount) })}
          </button>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-ink-2">{countLabel}</p>
        {streamStats && (
          <p className="text-sm text-muted">
            {t("streamPaidCount", { paid: String(streamStats.paidCount), total: String(statsFiltered.length) })}
            {" · "}
            {t("streamTotalSum")}: <Money amountEur={streamStats.totalSum} local={streamStats.totalLocal} />
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          {t("emptyNoMembersFiltered")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3 text-right font-medium">№</th>
                <th className="px-4 py-3 font-medium">{t("colName")}</th>
                {isHq && <th className="px-4 py-3 font-medium">{t("colClub")}</th>}
                <th className="px-4 py-3 font-medium">{t("colCourse")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, index) => {
                // When a status/course/поток filter is active, this row
                // shows (and totals) only the enrollment(s) that actually
                // matched it — not the member's whole course history — so
                // a member on several courses doesn't show payments/status
                // for a course that isn't the one being filtered for.
                const rowEnrollments = hasEnrollmentFilter ? matchingEnrollments(m) : m.enrollments;
                const totalPrice = rowEnrollments.reduce((sum, e) => sum + Number(e.price), 0);
                const totalLocal = sumLocal(rowEnrollments.map((e) => localOf(e.price_local, e.local_currency)));
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 text-right text-muted">{index + 1}</td>
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
                    <td className="px-4 py-3">
                      {(m.packages ?? []).map((p) => (
                        <div key={p.id} className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-ink-2">
                            {t("packageBadgeLabel")}
                          </span>
                          <span className="text-ink-2">{p.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.assigned < p.total ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"
                            }`}
                          >
                            {t("packageAssignedOf", { n: p.assigned, total: p.total })}
                          </span>
                        </div>
                      ))}
                      {rowEnrollments.length === 0 ? (
                        (m.packages ?? []).length === 0 && <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {rowEnrollments.map((e) => (
                            <div key={e.id} className="flex items-center gap-2">
                              <span className="text-ink-2">{e.product_name ?? t("optionCourseNotChosen")}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClasses(e.status)}`}
                              >
                                {statusLabel(e.status, locale)}
                              </span>
                              {e.needs_cohort && (
                                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                                  {t("badgeChooseCohort")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {totalPrice ? <Money amountEur={totalPrice} local={totalLocal} /> : "—"}
                    </td>
                  </tr>
                );
              })}
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
          products={products}
          cohorts={cohorts}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
