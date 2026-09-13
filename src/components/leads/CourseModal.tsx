"use client";

import { useMemo, useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import type { Tables } from "@/types/database";

type Product = Tables<"products">;
type Cohort = Tables<"product_cohorts">;

/**
 * "я поставила статус записалась, но куда записалась я выбрать не могу"
 * (Anastasiia, 13 сен 2026) — the course/поток fields were only ever
 * reachable through "Редактировать", with no prompt when a lead moves to
 * "Записалась" without one chosen yet. Without a product, round 8's
 * auto-reserve (see updateLeadStage) has nothing to reserve, so the stage
 * change quietly did nothing useful. This mirrors DeclineModal's own
 * pattern (a focused prompt at the moment of the stage change) — "Отмена"
 * cancels the stage change entirely, "Подтвердить" saves whatever course/
 * поток was picked (or none, if she'd rather set it later) and then moves
 * the lead to "Записалась".
 */
export default function CourseModal({
  leadName,
  products,
  cohorts,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  products: Product[];
  cohorts: Cohort[];
  onCancel: () => void;
  onConfirm: (productId: string | null, cohortDate: string | null) => void;
}) {
  const t = useT();
  const [productId, setProductId] = useState("");
  const [cohortDate, setCohortDate] = useState("");

  const productCohorts = useMemo(
    () => cohorts.filter((c) => c.product_id === productId),
    [cohorts, productId]
  );

  function handleProductChange(id: string) {
    setProductId(id);
    setCohortDate("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{t("courseModalTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("courseModalSubtitle", { name: leadName })}</p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink-2">{t("fieldCourseOptional")}</span>
          <select
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">{t("optionCourseNotChosen")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {productId && (
          <label className="mt-3 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">{t("fieldCohortStart")}</span>
            {productCohorts.length > 0 ? (
              <select
                value={cohortDate}
                onChange={(e) => setCohortDate(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">{t("optionNotChosen")}</option>
                {productCohorts.map((c) => (
                  <option key={c.id} value={c.start_date}>
                    {c.start_date}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted">{t("emptyNoCohorts")}</p>
            )}
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => onConfirm(productId || null, productId ? cohortDate || null : null)}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
