import { formatPctDelta, formatPointsDelta } from "@/lib/dashboard";

export type ClubRow = {
  id: string;
  name: string;
  leadsCount: number;
  membersCount: number;
  collected: number;
  pending: number;
};

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

export default function DashboardBoard({
  totals,
  stageCounts,
  clubs,
  revenue,
  membersAddedThisMonth,
  conversion,
  royalty,
}: {
  totals: Totals;
  stageCounts: StageCount[];
  clubs: ClubRow[];
  revenue: { thisMonth: number; delta: number | null };
  membersAddedThisMonth: number;
  conversion: { thisMonth: number | null; lastMonth: number | null };
  royalty: { amount: number; percent: number };
}) {
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Выручка сети (этот месяц)"
          value={`€${revenue.thisMonth}`}
          delta={formatPctDelta(revenue.delta)}
        />
        <StatTile
          label="Участниц по сети"
          value={String(totals.members)}
          delta={
            membersAddedThisMonth > 0
              ? `+${membersAddedThisMonth} в этом месяце`
              : "никого не добавлено в этом месяце"
          }
        />
        <StatTile
          label="Роялти к оплате"
          value={`€${royalty.amount}`}
          delta={`${royalty.percent}% от выручки этого месяца`}
        />
        <StatTile
          label="Лид → участница"
          value={conversion.thisMonth === null ? "—" : `${conversion.thisMonth}%`}
          delta={formatPointsDelta(conversion.thisMonth, conversion.lastMonth)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Лидов по сети (всего)" value={String(totals.leads)} delta="за всё время" />
        <StatTile label="Собрано (всего)" value={`€${totals.collected}`} delta="за всё время" />
        <StatTile label="Ожидается" value={`€${totals.pending}`} delta="ещё не оплачено" />
        <StatTile label="Клубов в сети" value={String(clubs.length)} delta="действующих" />
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground">Воронка лидов по сети</h2>
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
          <h2 className="text-sm font-semibold text-foreground">По клубам</h2>
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
