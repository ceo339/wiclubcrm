"use client";

import Money from "@/components/currency/Money";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { PackageSaleRow } from "@/app/packages/actions";

/**
 * Read-only summary opened by clicking a "Пакет" row in «Оплаты» — the
 * actual per-course "Назначить поток" action lives on the member's own card
 * (MemberDetailModal), so this just shows what's already been distributed
 * and what's still pending, same wording as PackageSaleCard there.
 */
export default function PackageSaleDetailModal({
  pkg,
  onClose,
}: {
  pkg: PackageSaleRow;
  onClose: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{pkg.label}</h3>
        <p className="mt-1 text-sm text-muted">{pkg.member_name ?? "—"}</p>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">{t("packageTotalLabel")}</span>
          <span className="font-medium text-foreground">
            <Money amountEur={pkg.total_price} />
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {pkg.items.map((item) => (
            <div key={item.id} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink-2">{item.product_name ?? t("optionCourseNotChosen")}</span>
                {item.enrollment_id ? (
                  <span className="flex items-center gap-2 text-muted">
                    <span>{t("packageItemAssignedOn", { date: item.start_date ?? "" })}</span>
                    <span className="text-ink-2">
                      <Money amountEur={item.allocated_price ?? 0} />
                    </span>
                  </span>
                ) : (
                  <span className="text-muted">{t("packageItemPending")}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
