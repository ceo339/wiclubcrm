"use client";

import { useMemo, useState } from "react";
import { STATUSES, statusLabel } from "@/lib/payments";
import type { MemberOption, Payment } from "./types";
import NewPaymentModal from "./NewPaymentModal";
import EditPaymentModal from "./EditPaymentModal";
import PaymentLinkModal from "./PaymentLinkModal";

export default function PaymentsBoard({
  initialPayments,
  memberOptions,
  canEdit,
  stripeEnabled,
}: {
  initialPayments: Payment[];
  memberOptions: MemberOption[];
  canEdit: boolean;
  stripeEnabled: boolean;
}) {
  const [status, setStatus] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isHq = !canEdit;

  const filtered = useMemo(() => {
    if (status === "all") return initialPayments;
    return initialPayments.filter((p) => p.status === status);
  }, [initialPayments, status]);

  const totalPaid = useMemo(
    () => filtered.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0),
    [filtered]
  );
  const totalPending = useMemo(
    () => filtered.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount), 0),
    [filtered]
  );

  const selected = initialPayments.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Собрано</div>
          <div className="mt-1 text-xl font-semibold text-foreground">€{totalPaid}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Ожидается</div>
          <div className="mt-1 text-xl font-semibold text-foreground">€{totalPending}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Всего записей</div>
          <div className="mt-1 text-xl font-semibold text-foreground">{filtered.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">Все статусы</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {canEdit && stripeEnabled && (
          <button
            onClick={() => setShowLink(true)}
            className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            + Ссылка на оплату
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className={`rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background ${stripeEnabled ? "" : "ml-auto"}`}
          >
            + Оплата
          </button>
        )}
      </div>

      {isHq && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Режим HQ: видны оплаты всех клубов сети, доступно только для просмотра.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          Оплат по этим фильтрам не найдено.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Участница</th>
                {isHq && <th className="px-4 py-3 font-medium">Клуб</th>}
                <th className="px-4 py-3 font-medium">Курс</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.member_name ?? "—"}</td>
                  {isHq && <td className="px-4 py-3 text-muted">{p.partner_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted">{p.product_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                      {statusLabel(p.status ?? "paid")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.paid_date}</td>
                  <td className="px-4 py-3 font-medium text-foreground">€{p.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPaymentModal members={memberOptions} onClose={() => setShowNew(false)} />}
      {showLink && <PaymentLinkModal members={memberOptions} onClose={() => setShowLink(false)} />}
      {selected && (
        <EditPaymentModal
          key={selected.id}
          payment={selected}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
