"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

export type MultiSelectOption = { value: string; label: string };

/**
 * A `selected` set can never legitimately contain this string as a real
 * option value (options always come from real source/campaign/course/stream
 * data) — used as a sentinel to represent "deliberately deselected
 * everything", distinct from the empty set's existing meaning of "all"
 * (see below). Kept private to this file: every consumer only ever calls
 * `.size`/`.has(realValue)` on the set it gets back, both of which already
 * behave correctly against a sentinel-only set without the consumer needing
 * to know it exists (`.size > 0` still triggers filtering, and `.has()`
 * never matches a real value, so every row is correctly filtered out).
 */
const NONE_MARKER = "\u0000__multiselect_none__\u0000";

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
 *
 * Round 30 — "если нажать на все источники, то выбираются все, если нажать
 * еще раз, то отменяются все" (Anastasiia, 17 сен 2026): the "Все ..." row
 * used to be a no-op after the first click — since `selected` collapses to
 * the full explicit set (still "all" by the check below) rather than ever
 * reaching a distinct "none" state, a second click just reselected the same
 * "all" state again. The master checkbox is now a genuine toggle between
 * "all" (the canonical empty set, unchanged) and "none" — represented by
 * `NONE_MARKER` so every real option reads as unchecked and every consumer's
 * existing "> 0 means filter" logic correctly shows zero matching rows,
 * without any change needed outside this component.
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

  const isNoneSelected = selected.has(NONE_MARKER);
  const allSelected = !isNoneSelected && (selected.size === 0 || selected.size === options.length);
  const buttonLabel = isNoneSelected
    ? t("noFiltersSelected")
    : allSelected
      ? allLabel
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? allLabel)
        : t("nFiltersSelected", { n: selected.size });

  function toggle(value: string) {
    // Starting from either sentinel state ("all" — empty set, or "none" —
    // NONE_MARKER) and checking/unchecking one option should narrow from
    // the real underlying set that sentinel represents, not from the
    // sentinel's literal contents — expand first so the click actually
    // changes the filter instead of operating on a marker value.
    const next = isNoneSelected
      ? new Set<string>()
      : selected.size === 0
        ? new Set(options.map((o) => o.value))
        : new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (next.size === options.length) onChange(new Set());
    else if (next.size === 0) onChange(new Set([NONE_MARKER]));
    else onChange(next);
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
              onChange={() => onChange(allSelected ? new Set([NONE_MARKER]) : new Set())}
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
