"use client";

import { useState, useTransition } from "react";
import { addCohort, deleteCohort, deleteProduct } from "@/app/products/actions";
import { todayIso } from "@/lib/payments";
import Money from "@/components/currency/Money";
import { useT } from "@/components/i18n/LocaleProvider";
import type { Cohort, Product } from "./types";
import NewProductModal from "./NewProductModal";

export default function ProductsBoard({
  initialProducts,
  initialCohorts,
  leadsCountByProduct,
  membersCountByCohort,
  isHq,
  canEdit,
}: {
  initialProducts: Product[];
  initialCohorts: Cohort[];
  /** Real count of leads interested in each product (by product id) — the
   * prototype's own "N в воронке" caption, computed from real leads rather
   * than fabricated. */
  leadsCountByProduct: Record<string, number>;
  /** Real enrolled-member count per cohort, keyed "productId|startDate". */
  membersCountByCohort: Record<string, number>;
  isHq: boolean;
  canEdit: boolean;
}) {
  const t = useT();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {initialProducts.length === 0
            ? t("emptyNoCoursesYet")
            : t("coursesCountLabel", { n: initialProducts.length })}
        </p>
        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("btnAddCourseShort")}
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("hqReadOnlyCoursesBanner")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            cohorts={initialCohorts.filter((c) => c.product_id === product.id)}
            leadsInPipeline={leadsCountByProduct[product.id] ?? 0}
            membersCountByCohort={membersCountByCohort}
            canEdit={canEdit}
            showPartner={isHq}
          />
        ))}
      </div>

      {showNew && <NewProductModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function ProductCard({
  product,
  cohorts,
  leadsInPipeline,
  membersCountByCohort,
  canEdit,
  showPartner,
}: {
  product: Product;
  cohorts: Cohort[];
  leadsInPipeline: number;
  membersCountByCohort: Record<string, number>;
  canEdit: boolean;
  showPartner: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sortedCohorts = [...cohorts].sort((a, b) => a.start_date.localeCompare(b.start_date));

  function handleAddCohort() {
    if (!newDate) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("product_id", product.id);
      fd.set("start_date", newDate);
      const res = await addCohort(fd);
      if (res.error) setError(res.error);
      else setNewDate("");
    });
  }

  function handleDeleteCohort(id: string) {
    startTransition(async () => {
      await deleteCohort(id);
    });
  }

  function handleDeleteProduct() {
    if (!confirm(t("confirmDeleteProduct", { name: product.name }))) {
      return;
    }
    startTransition(async () => {
      await deleteProduct(product.id);
    });
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{product.name}</div>
          <div className="mt-0.5 text-xs text-muted">
            <Money amountEur={product.price} />
            {product.sessions ? ` · ${t("sessionsSuffix", { n: product.sessions })}` : ""}
            {showPartner && product.partner_name ? ` · ${product.partner_name}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            {t("prodEnrolled", { n: leadsInPipeline })}
          </span>
          {canEdit && (
            <button
              onClick={handleDeleteProduct}
              disabled={pending}
              className="text-xs text-muted hover:text-accent-strong"
            >
              {t("delete")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-2">{t("headingCohorts")}</span>
        {sortedCohorts.length === 0 && (
          <p className="text-xs text-muted">{t("emptyNoCohorts")}</p>
        )}
        {sortedCohorts.map((c) => {
          const enrolled = membersCountByCohort[`${product.id}|${c.start_date}`] ?? 0;
          const isPast = c.start_date < todayIso();
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>{c.start_date}</span>
              <span className="text-muted">{t("prodSeats", { n: enrolled })}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  isPast ? "bg-surface-2 text-muted" : "bg-surface-3 text-ink-2"
                }`}
              >
                {t(isPast ? "prodPast" : "prodUpcoming")}
              </span>
              {canEdit && (
                <button
                  onClick={() => handleDeleteCohort(c.id)}
                  disabled={pending}
                  className="ml-auto text-muted hover:text-accent-strong"
                  aria-label={t("ariaDeleteCohort")}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleAddCohort}
            disabled={pending || !newDate}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {t("btnAddDateShort")}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-accent-strong">{t(error)}</p>}
    </div>
  );
}
