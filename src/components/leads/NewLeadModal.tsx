"use client";

import { useActionState, useMemo, useState } from "react";
import { createLead, type ActionResult } from "@/app/leads/actions";
import { COUNTRIES, GENERIC_PLANS, SOURCES, SOURCE_LABELS } from "@/lib/leads";
import type { Tables } from "@/types/database";

const initialState: ActionResult = { error: null };

type Product = Tables<"products">;
type Cohort = Tables<"product_cohorts">;

// Encodes the "Интересует" fallback select: either a generic membership
// plan or one of the partner's real courses, mirroring the prototype's
// grouped dropdown (Членство / Курсы).
type Interested = { kind: "none" } | { kind: "generic"; id: string } | { kind: "product"; id: string };

export default function NewLeadModal({
  products,
  cohorts,
  onClose,
}: {
  products: Product[];
  cohorts: Cohort[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await createLead(formData);
      if (!result.error) onClose();
      return result;
    },
    initialState
  );

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [courseId, setCourseId] = useState("");
  const [cohortDate, setCohortDate] = useState("");
  const [interested, setInterested] = useState<Interested>({ kind: "none" });
  const [value, setValue] = useState("");

  const activeProductId = courseId || (interested.kind === "product" ? interested.id : "");
  const activeProduct = products.find((p) => p.id === activeProductId) ?? null;
  const productCohorts = useMemo(
    () => cohorts.filter((c) => c.product_id === activeProductId),
    [cohorts, activeProductId]
  );

  function handleCountryChange(name: string) {
    setCountry(name);
    const match = COUNTRIES.find((c) => c.name === name);
    if (match?.city) setCity(match.city);
  }

  function handleCourseChange(id: string) {
    setCourseId(id);
    setCohortDate("");
    if (id) {
      setInterested({ kind: "none" });
      const product = products.find((p) => p.id === id);
      if (product) setValue(String(product.price));
    } else {
      setValue("");
    }
  }

  function handleInterestedChange(raw: string) {
    setCohortDate("");
    if (!raw) {
      setInterested({ kind: "none" });
      setValue("");
      return;
    }
    const [kind, id] = raw.split(":");
    if (kind === "generic") {
      setInterested({ kind: "generic", id });
      const plan = GENERIC_PLANS.find((p) => p.id === id);
      setValue(plan ? String(plan.price) : "");
    } else if (kind === "product") {
      setInterested({ kind: "product", id });
      const product = products.find((p) => p.id === id);
      setValue(product ? String(product.price) : "");
    }
  }

  const plan = interested.kind === "generic" ? interested.id : "";

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
        <h3 className="text-base font-semibold text-foreground">Новый лид</h3>

        <div className="mt-4 flex flex-col gap-3">
          <Field label="Имя" name="name" required />
          <Field label="Email" name="email" type="email" />
          <Field label="Телефон" name="phone" type="tel" />

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Источник</span>
            <select
              name="source"
              defaultValue="Website"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Страна</span>
            <select
              name="country"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">— не указано —</option>
              {COUNTRIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Город</span>
            <input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <Field label="Дата рождения" name="birthday" type="date" />

          {products.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Курс (необязательно)</span>
              <select
                value={courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
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

          {!courseId && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Интересует</span>
              <select
                value={
                  interested.kind === "none" ? "" : `${interested.kind}:${interested.id}`
                }
                onChange={(e) => handleInterestedChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">— не выбрано —</option>
                <optgroup label="Членство">
                  {GENERIC_PLANS.map((p) => (
                    <option key={p.id} value={`generic:${p.id}`}>
                      {p.label} · ${p.price}
                    </option>
                  ))}
                </optgroup>
                {products.length > 0 && (
                  <optgroup label="Курсы">
                    {products.map((p) => (
                      <option key={p.id} value={`product:${p.id}`}>
                        {p.name} · ${p.price}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}

          {activeProduct && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Начало потока</span>
              {productCohorts.length > 0 ? (
                <select
                  value={cohortDate}
                  onChange={(e) => setCohortDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  <option value="">— не выбрано —</option>
                  {productCohorts.map((c) => (
                    <option key={c.id} value={c.start_date}>
                      {c.start_date}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted">Нет запланированных потоков</p>
              )}
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Сумма (€)</span>
            <input
              name="value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>

          <input type="hidden" name="product_id" value={activeProductId} />
          <input type="hidden" name="cohort_start_date" value={cohortDate} />
          <input type="hidden" name="plan" value={plan} />
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

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}
