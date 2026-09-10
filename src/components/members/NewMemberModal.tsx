"use client";

import { useActionState, useState } from "react";
import { createMember, type ActionResult } from "@/app/members/actions";
import { currentMonthYear, STATUSES } from "@/lib/members";
import type { Tables } from "@/types/database";

const initialState: ActionResult = { error: null };

export default function NewMemberModal({
  products,
  onClose,
}: {
  products: Tables<"products">[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await createMember(formData);
      if (!result.error) onClose();
      return result;
    },
    initialState
  );

  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");

  function handleProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product) setPrice(String(product.price));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
      >
        <h3 className="text-base font-semibold text-foreground">Новая участница</h3>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Имя</span>
            <input
              name="name"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Статус</span>
            <select
              name="status"
              defaultValue="sPaid"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {products.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Курс (необязательно)</span>
              <select
                name="product_id"
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">— не выбран —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ${p.price}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Дата начала</span>
            <input
              name="start_date"
              type="date"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Город</span>
            <input
              name="city"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Сумма (€)</span>
            <input
              name="price_collected"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Участница с</span>
            <input
              name="member_since"
              defaultValue={currentMonthYear()}
              placeholder="09.2026"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>

        {state.error && (
          <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
            {state.error}
          </p>
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
            disabled={pending}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "..." : "Создать"}
          </button>
        </div>
      </form>
    </div>
  );
}
