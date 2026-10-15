"use client";

import { useMemo, useRef, useState } from "react";
import { setPresence } from "@/app/members/actions";
import { attendedArray, attendanceStats } from "@/lib/members";
import { useT } from "@/components/i18n/LocaleProvider";

type MemberRow = { id: string; name: string; attended: unknown };

/**
 * Round 69 — быстрая отметка: клик = «была», ещё клик = снять («не отмечено
 * = не была»). Раньше было три состояния, а на время запроса блокировались
 * ВСЕ кнопки (поэтому второго человека быстро не отметить), и состояние
 * хранилось по номеру строки — когда сервер после сохранения присылал
 * список в другом порядке, фамилии «прыгали», а галочки оставались на месте.
 *
 * Теперь:
 *  - состояние хранится по id записи, а не по номеру строки;
 *  - список участниц всегда отсортирован по имени и не зависит от порядка,
 *    в котором его вернул сервер;
 *  - отметка показывается мгновенно (оптимистично), кнопки не блокируются;
 *  - запросы одной и той же участницы идут по очереди (чтобы не затирать друг
 *    друга), разных участниц — параллельно;
 *  - при ошибке отметка откатывается и показывается сообщение.
 */
export default function GroupAttendanceBoard({
  members,
  sessions,
  canEdit,
  onAvgChange,
}: {
  members: MemberRow[];
  sessions: number;
  canEdit: boolean;
  onAvgChange?: (avg: number | null) => void;
}) {
  const t = useT();
  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, "ru") || a.id.localeCompare(b.id)),
    [members]
  );

  const [grid, setGrid] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(members.map((m) => [m.id, attendedArray(m.attended, sessions).map((v) => v === true)]))
  );
  const gridRef = useRef(grid);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const [failed, setFailed] = useState<string | null>(null);

  function commit(next: Record<string, boolean[]>) {
    gridRef.current = next;
    setGrid(next);
    onAvgChange?.(attendanceStats(sorted.map((m) => next[m.id] ?? [])).avg);
  }

  function setCell(id: string, col: number, value: boolean) {
    const row = [...(gridRef.current[id] ?? [])];
    row[col] = value;
    commit({ ...gridRef.current, [id]: row });
  }

  function toggle(id: string, col: number) {
    if (!canEdit) return;
    const next = !(gridRef.current[id]?.[col] === true);
    setFailed(null);
    setCell(id, col, next);
    const prev = queues.current.get(id) ?? Promise.resolve();
    const job = prev
      .catch(() => undefined)
      .then(() => setPresence(id, col, next))
      .then((res) => {
        if (res?.error) throw new Error(res.error);
      })
      .catch((e: unknown) => {
        setCell(id, col, !next);
        setFailed(e instanceof Error && e.message ? e.message : "error");
      });
    queues.current.set(id, job);
  }

  const sessionIndexes = Array.from({ length: sessions }, (_, i) => i);

  if (members.length === 0) {
    return <p className="p-5 text-sm text-muted">{t("emptyNoMembersInStream")}</p>;
  }

  if (sessions === 0) {
    return <p className="p-5 text-sm text-muted">{t("emptyNoSessions")}</p>;
  }

  const stats = attendanceStats(sorted.map((m) => grid[m.id] ?? []));

  return (
    <div className="overflow-x-auto">
      {failed && (
        <p className="border-b border-border bg-accent/10 px-5 py-2 text-sm text-accent-strong">
          {t("errAttendanceSaveFailed")} ({failed})
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-background px-5 py-3 font-medium">{t("colMember")}</th>
            {sessionIndexes.map((i) => (
              <th key={i} className="px-1 py-3 text-center font-medium">
                {i + 1}
              </th>
            ))}
            <th className="px-5 py-3 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, row) => {
            const rowValues = grid[m.id] ?? [];
            const pct = stats.pcts[row];
            return (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-background px-5 py-2 font-medium text-foreground">
                  {m.name}
                </td>
                {sessionIndexes.map((col) => {
                  const on = rowValues[col] === true;
                  return (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={on}
                        onClick={() => toggle(m.id, col)}
                        title={t("sessionTitle", { n: col + 1, name: m.name })}
                        className={`mx-auto flex h-8 w-8 touch-manipulation items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                          on
                            ? "border-accent bg-accent text-white"
                            : "border-dashed border-border text-muted hover:border-accent hover:text-accent-strong"
                        }`}
                      >
                        {on ? "✓" : col + 1}
                      </button>
                    </td>
                  );
                })}
                <td className="px-5 py-2 text-right text-muted">{pct === null ? "—" : `${pct}%`}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-xs text-muted">
            <td className="sticky left-0 z-10 bg-background px-5 py-2 font-medium text-ink-2">
              {t("rowPresentCount")}
            </td>
            {sessionIndexes.map((col) => (
              <td key={col} className="px-1 py-2 text-center font-medium text-ink-2">
                {sorted.filter((m) => grid[m.id]?.[col] === true).length}
              </td>
            ))}
            <td className="px-5 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
