"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * Round 59 — «Требует внимания»: one line per kind of unfinished business with a
 * count and a link to the already-filtered list. Renders nothing when there is
 * nothing to do, so a tidy club sees no empty box.
 */
export default function AttentionWidget({
  unlinkedPayments,
  needsCohort,
}: {
  unlinkedPayments: number;
  needsCohort: number;
}) {
  const { t } = useLocale();
  if (unlinkedPayments === 0 && needsCohort === 0) return null;

  const rows = [
    { count: unlinkedPayments, labelKey: "attnUnlinkedPayments", href: "/payments?unlinked=1" },
    { count: needsCohort, labelKey: "attnNeedsCohort", href: "/members?needsCohort=1" },
  ].filter((r) => r.count > 0);

  return (
    <div className="w-full rounded-xl border border-border bg-background p-5 text-left shadow-card">
      <div className="text-sm font-medium text-foreground">{t("headingNeedsAttention")}</div>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.labelKey}>
            <Link
              href={r.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>{t(r.labelKey)}</span>
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">{r.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
