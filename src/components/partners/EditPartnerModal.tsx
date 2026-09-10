"use client";

import { useActionState, useState } from "react";
import { updatePartner } from "@/app/partners/actions";
import { COUNTRIES } from "@/lib/leads";
import type { Tables } from "@/types/database";

const initialState = { error: null as string | null };

export default function EditPartnerModal({
  partner,
  onClose,
}: {
  partner: Tables<"partners">;
  onClose: () => void;
}) {
  const [country, setCountry] = useState(partner.country ?? "");
  const [city, setCity] = useState(partner.city ?? "");

  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await updatePartner(partner.id, formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  function handleCountryChange(name: string) {
    setCountry(name);
    const match = COUNTRIES.find((c) => c.name === name);
    if (match?.city) setCity(match.city);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={formAction}>
          <h3 className="text-base font-semibold text-foreground">Редактировать клуб</h3>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Название клуба</span>
              <input
                name="name"
                required
                defaultValue={partner.name}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">Страна</span>
              <select
                name="country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">— выберите —</option>
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
              disabled={pending}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
