"use client";

import { useActionState, useState, useTransition } from "react";
import { updatePartner, resetPartnerPassword } from "@/app/partners/actions";
import { COUNTRIES } from "@/lib/leads";
import { useT } from "@/components/i18n/LocaleProvider";
import type { Tables } from "@/types/database";

const initialState = { error: null as string | null };

export default function EditPartnerModal({
  partner,
  onClose,
}: {
  partner: Tables<"partners">;
  onClose: () => void;
}) {
  const t = useT();
  const [country, setCountry] = useState(partner.country ?? "");
  const [city, setCity] = useState(partner.city ?? "");

  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await updatePartner(partner.id, formData);
    if (!result.error) onClose();
    return result;
  }, initialState);

  // "где хранятся пароли от учетных записей? и где их менять?" (Anastasiia,
  // 15 сен 2026) — resets the club's own login password from right here
  // instead of the Supabase dashboard. Deliberately separate from the
  // form/formAction above: this isn't a field on the club being saved,
  // it's an immediate action with its own confirmation, same shape as the
  // one-time credentials shown when a club is first created.
  const [resetPending, startReset] = useTransition();
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleResetPassword() {
    setResetError(null);
    startReset(async () => {
      const result = await resetPartnerPassword(partner.id);
      if (result.error || !result.tempPassword) {
        setResetError(result.error ?? "errCreateLoginFailed");
        return;
      }
      setResetResult({ email: result.resetEmail ?? "", password: result.tempPassword });
      setConfirmingReset(false);
    });
  }

  async function handleCopyReset() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(
        t("clipboardCredentialsText", { email: resetResult.email, password: resetResult.password })
      );
      setResetCopied(true);
    } catch {
      // clipboard API unavailable — the text below is still selectable by hand
    }
  }

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
          <h3 className="text-base font-semibold text-foreground">{t("headingEditClub")}</h3>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldClubName")}</span>
              <input
                name="name"
                required
                defaultValue={partner.name}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldCountry")}</span>
              <select
                name="country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">{t("optionSelectGeneric")}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldCity")}</span>
              <input
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldReplyToEmail")}</span>
              <input
                name="reply_to_email"
                type="email"
                defaultValue={partner.reply_to_email ?? ""}
                placeholder="club@example.com"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="text-xs text-muted">{t("fieldReplyToEmailHint")}</span>
            </label>

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">{t("fieldLeadIntakeUrl")}</span>
              <input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/leads/intake/${partner.intake_key}`}
                onFocus={(e) => e.currentTarget.select()}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-ink-2 outline-none"
              />
              <span className="text-xs text-muted">{t("fieldLeadIntakeUrlHint")}</span>
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <span className="font-medium text-ink-2">{t("fieldClubLoginPassword")}</span>
              {resetResult ? (
                <>
                  <div className="flex flex-col gap-1 text-sm">
                    <div>
                      <span className="text-muted">{t("fieldEmailColon")}</span>
                      <span className="font-medium text-ink-2">{resetResult.email}</span>
                    </div>
                    <div>
                      <span className="text-muted">{t("fieldPasswordColon")}</span>
                      <span className="font-mono font-medium text-ink-2">{resetResult.password}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyReset}
                    className="mt-1 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
                  >
                    {resetCopied ? t("btnCopied") : t("btnCopy")}
                  </button>
                  <p className="text-xs text-muted">{t("resetPasswordShownOnceHint")}</p>
                </>
              ) : confirmingReset ? (
                <>
                  <p className="text-xs text-muted">{t("confirmResetPassword")}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={resetPending}
                      onClick={handleResetPassword}
                      className="rounded-lg border border-accent-strong px-3 py-1.5 text-xs font-medium text-accent-strong hover:bg-accent/10 disabled:opacity-50"
                    >
                      {resetPending ? "..." : t("btnResetPasswordConfirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted">{t("fieldClubLoginPasswordHint")}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
                  >
                    {t("btnResetPassword")}
                  </button>
                </>
              )}
              {resetError && (
                <p className="text-xs text-accent-strong">{t(resetError)}</p>
              )}
            </div>
          </div>

          {state.error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{t(state.error)}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "..." : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
