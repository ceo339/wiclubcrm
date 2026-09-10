"use client";

import { useState, useTransition } from "react";
import { setAttendance } from "@/app/members/actions";
import { attendedArray } from "@/lib/members";
import { useT } from "@/components/i18n/LocaleProvider";

type MemberRow = { id: string; name: string; attended: unknown };

/**
 * The same three-state toggle (null → present → absent → null) as the
 * per-member card tracker, laid out as a grid so a partner can mark a whole
 * class in one sitting instead of opening each participant one by one.
 */
export default function GroupAttendanceBoard({
  members,
  sessions,
  canEdit,
}: {
  members: MemberRow[];
  sessions: number;
  canEdit: boolean;
}) {
  const [grid, setGrid] = useState<(boolean | null)[][]>(() =>
    members.map((m) => attendedArray(m.attended, sessions))
  );
  const [pending, startTransition] = useTransition();
  const t = useT();

  function cycle(row: number, col: number) {
    if (!canEdit) return;
    const current = grid[row][col];
    const next = current === null ? true : current === true ? false : null;
    setGrid((prev) => {
      const copy = prev.map((r) => [...r]);
      copy[row] = [...copy[row]];
      copy[row][col] = next;
      return copy;
    });
    startTransition(async () => {
      await setAttendance(members[row].id, col, next);
    });
  }

  const sessionIndexes = Array.from({ length: sessions }, (_, i) => i);

  if (members.length === 0) {
    return <p className="p-5 text-sm text-muted">{t("emptyNoMembersInStream")}</p>;
  }

  if (sessions === 0) {
    return <p className="p-5 text-sm text-muted">{t("emptyNoSessions")}</p>;
  }

  return (
    <div className="overflow-x-auto">
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
          {members.map((m, row) => {
            const rowValues = grid[row];
            const present = rowValues.filter((v) => v === true).length;
            const marked = rowValues.filter((v) => v !== null).length;
            const pct = marked > 0 ? Math.round((present / marked) * 100) : null;
            return (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-background px-5 py-2 font-medium text-foreground">
                  {m.name}
                </td>
                {sessionIndexes.map((col) => {
                  const v = rowValues[col];
                  return (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || pending}
                        onClick={() => cycle(row, col)}
                        title={t("sessionTitle", { n: col + 1, name: m.name })}
                        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium ${
                          v === true
                            ? "border-accent bg-accent/10 text-accent-strong"
                            : v === false
                              ? "border-border bg-surface-2 text-muted line-through"
                              : "border-dashed border-border text-muted"
                        }`}
                      >
                        {col + 1}
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
                {grid.filter((r) => r[col] === true).length}
              </td>
            ))}
            <td className="px-5 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
