"use client";

import { useActionState, useState } from "react";
import { createClubPartner, type ActionResult } from "@/app/partners/actions";
import { COUNTRIES } from "@/lib/leads";

const initialState: ActionResult = { error: null };

export default function NewPartnerModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(
    null
  );
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [copied, setCopied] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await createClubPartner(formData);
      if (!result.error && result.tempPassword) {
        setCredentials({ email, password: result.tempPassword });
      }
      return result;
    },
    initialState
  );

  function handleCountryChange(name: string) {
    setCountry(name);
    const match = COUNTRIES.find((c) => c.name === name);
    if (match?.city) setCity(match.city);
  }

  async function handleCopy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${credentials.email}\nПароль: ${credentials.password}`
      );
      setCopied(true);
    } catch {
      // clipboard API unavailable — the user can still select the text manually
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={credentials ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {credentials ? (
          <>
            <h3 className="text-base font-semibold text-foreground">Клуб создан</h3>
            <p className="mt-2 text-sm text-ink-2">
              Передайте эти данные франчайзи для первого входа — пароль показывается только
              один раз и больше нигде не сохраняется.
            </p>
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <div>
                <span className="text-muted">Email: </span>
                <span className="font-medium text-ink-2">{credentials.email}</span>
              </div>
              <div>
                <span className="text-muted">Пароль: </span>
                <span className="font-mono font-medium text-ink-2">{credentials.password}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              {copied ? "Скопировано" : "Скопировать"}
            </button>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                Готово
              </button>
            </div>
          </>
        ) : (
          <form action={formAction}>
            <h3 className="text-base font-semibold text-foreground">Добавить клуб</h3>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">Название клуба</span>
                <input
                  name="name"
                  required
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

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink-2">Email для входа</span>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
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
        )}
      </div>
    </div>
  );
}
