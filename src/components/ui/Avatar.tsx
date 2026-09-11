/**
 * A plain initials circle — the visual affordance the prototype's own
 * avatar used (one/two letters from the name), with a single fixed color
 * for every avatar rather than the prototype's per-name hash color. A
 * hash-based color would look like it's encoding something about the
 * person; it isn't, so this stays neutral on purpose.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

export default function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
