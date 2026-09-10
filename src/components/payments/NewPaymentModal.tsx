"use client";

import { useActionState, useMemo, useState } from "react";
import { createPayment, type ActionResult } from "@/app/payments/actions";
import { STATUSES, todayIso } from "@/lib/payments";
import type { MemberOption } from "./types";

const initialState: ActionResult = { error: null };

export default function NewPaymentModal({
  members,
  onClose,
}: {
  members: MemberOption[];
  onClose: () => void;
}) {
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult, formData: FormData) => {
    const result = await createPayment(formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId) ?? null,
    [members, memberId]
  );

  function handleMemberChange(id: string) {
    setMemberId(id);
    const member = members.find((m) => m.id === id);
    if (member?.product_price != null) setAmount(String(member.product_price));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={formAction}>
          <h3 className="text-base font-semibold text-foreground">Новая оплата</h3>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Участница</span>
              <select
                name="member_id"
                value={memberId}
                onChange={(e) => handleMemberChange(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">— выберите —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.product_name ? ` — ${m.product_name}` : ""}
                  </option>
                ))}
              </select>
              {members.length === 0 && (
                <span className="text-xs text-muted">
                  Сначала добавьте участницу в разделе «Участницы».
                </span>
              )}
            </label>

            {selectedMember?.product_name && (
              <p className="text-xs text-muted">Курс: {selectedMember.product_name}</p>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Сумма (€)</span>
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Статус</span>
              <select
                name="status"
                defaultValue="paid"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Дата</span>
              <input
                name="paid_date"
                type="date"
                defaultValue={todayIso()}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>

          {state.error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{state.error}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={pending || members.length === 0}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "..." : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
