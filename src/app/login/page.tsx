"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";
import { useT } from "@/components/i18n/LocaleProvider";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";

const initialState: AuthFormState = { error: null, message: null };

/** Feature chips on the left panel — reuses the same nav-section labels
 * shown once signed in, so this list can never overclaim a feature (like
 * the prototype's own "Email/SMS" chip did) that the app doesn't actually
 * have — SMS isn't implemented, so it's left off here too. */
const FEATURE_CHIP_KEYS = ["navLeads", "navMembers", "navPayments", "navEmail"];

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState
  );

  const state = mode === "signin" ? signInState : signUpState;
  const t = useT();

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <LocaleScope scope="network" fallback="ru" />

      {/* Left panel — brand + headline, matching the prototype's #loginGate
       * .lg-left. Purely marketing content, no demo-only role switcher
       * here (that lived on the right panel in the prototype and isn't
       * reproduced — see the card below). */}
      <div className="relative flex flex-[1.1] flex-col justify-center overflow-hidden border-b border-border bg-background px-7 py-10 md:border-b-0 md:border-r md:px-16 md:py-14">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[60px]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-36 -right-20 h-[360px] w-[360px] rounded-full bg-ink-2/10 blur-[60px]"
        />

        <div className="relative mb-10 flex items-center gap-3 md:mb-14">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent font-display text-[21px] leading-none text-white">
            Wi
          </span>
          <span className="text-[22px] tracking-tight text-foreground">WI Club CRM</span>
        </div>

        <h1 className="relative max-w-[480px] text-[28px] leading-[1.15] text-foreground md:text-[38px]">
          {t("loginHeadline")}
        </h1>
        <p className="relative mt-4 max-w-[420px] text-[15.5px] text-muted">
          {t("loginSubtitle")}
        </p>

        <div className="relative mt-8 flex flex-wrap gap-2">
          {FEATURE_CHIP_KEYS.map((key) => (
            <span
              key={key}
              className="rounded-full border border-border-strong bg-surface-2 px-3.5 py-2 text-[12.5px] font-semibold text-ink-2"
            >
              {t(key)}
            </span>
          ))}
        </div>
      </div>

      {/* Right panel — the real sign-in/sign-up card, styled to the
       * prototype's .lg-card spec (title, field heights, button color).
       * The prototype's role toggle here ("Партнёр" / "Управляющая
       * компания") was a demo-only way to preview both portals from one
       * login — every real account has one fixed role assigned by HQ, so
       * the toggle in this position is the actual Вход/Регистрация mode
       * switch instead, not a fake role picker. */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-10 md:py-0">
        <div className="flex w-full max-w-[380px] flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[26px] text-foreground">{t("loginCardTitle")}</h2>
            <LocaleSwitcher />
          </div>
          <p className="mb-1 text-sm text-muted">
            {t(mode === "signin" ? "authSubtitleSignIn" : "authSubtitleSignUp")}
          </p>

          <div className="mt-6 flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signin"
                  ? "bg-background text-foreground shadow-card"
                  : "text-muted"
              }`}
            >
              {t("authTabSignIn")}
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-card"
                  : "text-muted"
              }`}
            >
              {t("authSubtitleSignUp")}
            </button>
          </div>

          {mode === "signin" ? (
            <form action={signInAction} className="mt-6 flex flex-col gap-4">
              <Field label={t("fieldEmail")} name="email" type="email" placeholder="partner@email.com" />
              <Field label={t("fieldPassword")} name="password" type="password" placeholder="••••••••••" />
              {state.error && <ErrorText text={state.error} />}
              <SubmitButton pending={signInPending} label={t("btnSignIn")} />
            </form>
          ) : (
            <form action={signUpAction} className="mt-6 flex flex-col gap-4">
              <Field label={t("fieldFullName")} name="full_name" type="text" />
              <Field label={t("fieldEmail")} name="email" type="email" placeholder="partner@email.com" />
              <Field
                label={t("fieldPassword")}
                name="password"
                type="password"
                placeholder="••••••••••"
                minLength={6}
              />
              {state.error && <ErrorText text={state.error} />}
              {state.message && (
                <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
                  {t(state.message)}
                </p>
              )}
              <SubmitButton pending={signUpPending} label={t("btnCreateAccount")} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        minLength={minLength}
        className="h-11 rounded-[10px] border border-border-strong bg-background px-3.5 text-[14.5px] text-foreground outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">
      {text}
    </p>
  );
}

function SubmitButton({
  pending,
  label,
}: {
  pending: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 h-[46px] rounded-[10px] bg-accent text-[14.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}
