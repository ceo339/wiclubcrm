"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

export type MultiSelectOption = { value: string; label: string };

/**
 * "Нет возможности выбрать сразу несколько, а только одну. Добавь выбор
 * нескольких и всех сразу" (Anastasiia, 15 сен 2026) — replaces the plain
 * single-value <select> used for the leads board's "Источник"/"Кампания"
 * filters with a checkbox dropdown that can hold any combination.
 *
 * `selected` empty is the canonical "all" state (no filter applied) — same
 * meaning the old dropdown's own "Все ..." option had, so nothing has to be
 * hand-ticked for the board to start out showing everyone. Checking the
 * top "Все ..." row (or re-checking every individual option by hand) always
 * collapses back to that same empty-set "all", rather than an
 * equivalent-but-distinct full set — keeps there being exactly one way to
 * mean "no filter".
 */
export default function MultiSelectFilter({
  allLabel,
  options,
  selected,
  onChange,
}: {
  allLabel: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const allSelected = selected.size === 0 || selected.size === options.length;
  const buttonLabel = allSelected
    ? allLabel
    : selected.size === 1
      ? (options.find((o) => selected.has(o.value))?.label ?? allLabel)
      : t("nFiltersSelected", { n: selected.size });

  function toggle(value: string) {
    // Starting from the canonical "all" (empty set) and unchecking one
    // option means "everyone except this one" — expand to the full list
    // first so the click actually narrows the filter instead of doing
    // nothing (removing from an empty set is a no-op).
    const next = selected.size === 0 ? new Set(options.map((o) => o.value)) : new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length ? new Set() : next);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <span className="max-w-[160px] truncate">{buttonLabel}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-card-hover">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? new Set(options.map((o) => o.value)) : new Set())}
              className="h-3.5 w-3.5"
            />
            {allLabel}
          </label>
          <div className="my-1 border-t border-border" />
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={allSelected || selected.has(o.value)}
                onChange={() => toggle(o.value)}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
