/**
 * A tiny trend line for a KPI tile — always fed a real monthly series
 * (see monthlyRevenue/monthlyMemberTotal/monthlyConversion in lib/dashboard),
 * never a decorative squiggle. Pure SVG, no interactivity, so this renders
 * fine on the server.
 */
export default function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, h - ((v - min) / range) * h] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      className="mt-2"
      aria-hidden
    >
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
