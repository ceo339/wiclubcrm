"use client";

import { useMemo, useState } from "react";
import { attendedArray } from "@/lib/members";
import { useLocale } from "@/components/i18n/LocaleProvider";
import GroupAttendanceBoard from "./GroupAttendanceBoard";

export type AttendanceCohort = {
  id: string;
  partnerId: string;
  partnerName: string;
  productId: string;
  productName: string;
  sessions: number;
  startDate: string;
};

/** One row per course ENROLLMENT, not per member — a member with two
 * courses shows up here twice, once per course, each with its own
 * attendance record. `id` is the enrollment id (what setAttendance below
 * actually updates), `name` is the member's name via a join. */
export type AttendanceMemberRow = {
  id: string;
  name: string;
  partner_id: string;
  product_id: string | null;
  start_date: string | null;
  attended: unknown;
};

function StatTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className="mt-1 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-foreground"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{caption}</div>
    </div>
  );
}

/**
 * One page, two dropdowns — product then cohort/start-date — instead of the
 * old click-through "list of streams -> one stream's grid" pages, matching
 * how the prototype's own attendance tab works. The prototype's third KPI
 * tile ("Риск не дойти до конца") was a churn-style score with no real
 * basis (see churn() in the prototype's own source — it falls back to
 * hashing the member's name when nothing else applies); that slot is
 * replaced here with "Записалось", a real headcount that the prototype
 * only ever showed as a caption, not a fabricated risk number.
 */
export default function AttendanceBoard({
  cohorts,
  members,
  isHq,
  ownPartnerId,
}: {
  cohorts: AttendanceCohort[];
  members: AttendanceMemberRow[];
  isHq: boolean;
  ownPartnerId: string | null;
}) {
  const { t } = useLocale();

  const productOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const c of cohorts) {
      if (seen.has(c.productId)) continue;
      const label = isHq ? `${c.productName} — ${c.partnerName}` : c.productName;
      seen.set(c.productId, { id: c.productId, label });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [cohorts, isHq]);

  const [productId, setProductId] = useState<string>(() => productOptions[0]?.id ?? "");

  const cohortOptions = useMemo(
    () =>
      cohorts
        .filter((c) => c.productId === productId)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [cohorts, productId]
  );

  const [cohortId, setCohortId] = useState<string>(() => cohortOptions[0]?.id ?? "");
  const selectedCohort = cohorts.find((c) => c.id === cohortId) ?? cohortOptions[0] ?? null;

  function handleProductChange(id: string) {
    setProductId(id);
    const firstCohort = cohorts.filter((c) => c.productId === id).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    setCohortId(firstCohort?.id ?? "");
  }

  if (productOptions.length === 0 || !selectedCohort) {
    return <p className="text-sm text-muted">{t("emptyNoStreams")}</p>;
  }

  const roster = members.filter(
    (m) =>
      m.partner_id === selectedCohort.partnerId &&
      m.product_id === selectedCohort.productId &&
      m.start_date === selectedCohort.startDate
  );

  const pctList = roster
    .map((m) => {
      const arr = attendedArray(m.attended, selectedCohort.sessions);
      const marked = arr.filter((v) => v !== null).length;
      const present = arr.filter((v) => v === true).length;
      return marked > 0 ? Math.round((present / marked) * 100) : null;
    })
    .filter((v): v is number => v !== null);
  const avgAttendance = pctList.length > 0 ? Math.round(pctList.reduce((a, b) => a + b, 0) / pctList.length) : null;

  const canEdit = !isHq && !!ownPartnerId && ownPartnerId === selectedCohort.partnerId;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={selectedCohort.id}
          onChange={(e) => setCohortId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {cohortOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.startDate}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t("kAvgAttend")}
          value={avgAttendance === null ? "—" : `${avgAttendance}%`}
          caption={t("prodSeats", { n: roster.length })}
        />
        <StatTile label={t("statEnrolled")} value={String(roster.length)} caption={selectedCohort.productName} />
        <StatTile
          label={t("thProgress")}
          value={selectedCohort.sessions ? `${selectedCohort.sessions}×` : "—"}
          caption={selectedCohort.productName}
        />
      </div>

      <div className="rounded-xl border border-border bg-background shadow-card">
        <GroupAttendanceBoard members={roster} sessions={selectedCohort.sessions} canEdit={canEdit} />
      </div>
    </div>
  );
}
