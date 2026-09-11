/**
 * "Откуда приходят лиды" — a real donut of lead counts by source, colored
 * with the same source→color mapping used everywhere else a source needs a
 * swatch (lib/leads.sourceColor: the kanban card dot, the Home channel bar
 * list). Pure SVG stroke-dasharray segments, no charting library needed for
 * four slices.
 */
export default function SourceDonut({
  rows,
  emptyLabel,
}: {
  rows: { label: string; color: string; count: number }[];
  emptyLabel: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const visible = rows.filter((r) => r.count > 0);

  if (total === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * r;

  const segments = visible.reduce<{ label: string; color: string; count: number; dasharray: string; dashoffset: number }[]>(
    (acc, row) => {
      const offsetSoFar = acc.reduce((sum, s) => sum - s.dashoffset, 0);
      const dash = (row.count / total) * circumference;
      acc.push({ ...row, dasharray: `${dash} ${circumference - dash}`, dashoffset: -offsetSoFar });
      return acc;
    },
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={emptyLabel}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={strokeWidth} />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
      </svg>
      <div className="flex min-w-[130px] flex-col gap-2 text-sm">
        {visible.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
            <span className="text-ink-2">{row.label}</span>
            <span className="ml-auto font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
