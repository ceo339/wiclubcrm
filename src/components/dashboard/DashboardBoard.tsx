import Link from "next/link";
import { formatDateRu, formatPctDelta, formatPointsDelta, monthLabel } from "@/lib/dashboard";

export type ClubRow = {
  id: string;
  name: string;
  leadsCount: number;
  membersCount: number;
  collected: number;
  pending: number;
};

export type Period = { mode: "month"; month: string } | { mode: "range"; from: string; to: string };

type StageCount = { id: string; label: string; count: number };

type Totals = {
  leads: number;
  members: number;
  collected: number;
  pending: number;
};

function StatTile({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted">{delta}</div>
    </div>
  );
}

function periodLabel(period: Period): string {
  return period.mode === "month"
    ? monthLabel(period.month)
    : `${formatDateRu(period.from)} – ${formatDateRu(period.to)}`;
}

function PeriodFilter({ period, monthOptions }: { period: Period; monthOptions: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        {monthOptions.map((m) => {
          const isActive = period.mode === "month" && period.month === m;
          return (
            <Link
              key={m}
              href={`/dashboard?month=${m}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-ink-2 hover:bg-surface-2"
              }`}
            >
              {monthLabel(m)}
            </Link>
          );
        })}
      </div>
      <form action="/dashboard" method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted">
          С
          <input
            type="date"
            name="from"
            defaultValue={period.mode === "range" ? period.from : ""}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          По
          <input
            type="date"
            name="to"
            defaultValue={period.mode === "range" ? period.to : ""}
            className="mt-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          Показать период
        </button>
        {period.mode === "range" && (
          <Link href="/dashboard" className="px-1 py-1.5 text-sm text-muted hover:text-ink-2">
            Сбросить к месяцам
          </Link>
        )}
      </form>
    </div>
  );
}

export default function DashboardBoard({
  totals,
  stageCounts,
  clubs,
  period,
  monthOptions,
  revenue,
  membersAdded,
  conversion,
  royalty,
}: {
  totals: Totals;
  stageCounts: StageCount[];
  clubs: ClubRow[];
  period: Period;
  monthOptions: string[];
  revenue: { amount: number; delta: number | null };
  membersAdded: number;
  conversion: { value: number | null; previous: number | null };
  royalty: { amount: number; percent: number };
}) {
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));
  const isRange = period.mode === "range";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PeriodFilter period={period} monthOptions={monthOptions} />

      <p className="text-sm text-muted">
        Показатели за: <span className="font-medium text-foreground">{periodLabel(period)}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Выручка сети"
          value={`€${revenue.amount}`}
          delta={isRange ? "за выбранный период" : formatPctDelta(revenue.delta)}
        />
        <StatTile
          label="Новых участниц"
          value={String(membersAdded)}
          delta={membersAdded > 0 ? `+${membersAdded} за период` : "не добавлено за период"}
        />
        <StatTile
          label="Роялти к оплате"
          value={`€${royalty.amount}`}
          delta={`${royalty.percent}% от выручки за период`}
        />
        <StatTile
          label="Лид → участница"
          value={conversion.value === null ? "—" : `${conversion.value}%`}
          delta={
            isRange
              ? conversion.value === null
                ? "нет лидов за период"
                : "без сравнения для периода"
              : formatPointsDelta(conversion.value, conversion.previous)
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Лидов по сети (всего)" value={String(totals.leads)} delta="за всё время" />
        <StatTile label="Собрано (всего)" value={`€${totals.collected}`} delta="за всё время" />
        <StatTile label="Ожидается" value={`€${totals.pending}`} delta="ещё не оплачено" />
        <StatTile label="Клубов в сети" value={String(clubs.length)} delta="действующих" />
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground">Воронка лидов за период</h2>
        <div className="mt-4 flex flex-col gap-3">
          {stageCounts.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-sm text-ink-2">{s.label}</div>
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-foreground"
                  style={{ width: `${(s.count / maxStage) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm font-medium text-foreground">
                {s.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">По клубам за период</h2>
        </div>
        {clubs.length === 0 ? (
          <p className="p-5 text-sm text-muted">В сети пока нет ни одного клуба.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Клуб</th>
                  <th className="px-5 py-3 font-medium">Лидов</th>
                  <th className="px-5 py-3 font-medium">Участниц</th>
                  <th className="px-5 py-3 font-medium">Собрано</th>
                  <th className="px-5 py-3 font-medium">Ожидается</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-3 text-muted">{c.leadsCount}</td>
                    <td className="px-5 py-3 text-muted">{c.membersCount}</td>
                    <td className="px-5 py-3 text-muted">€{c.collected}</td>
                    <td className="px-5 py-3 text-muted">€{c.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
