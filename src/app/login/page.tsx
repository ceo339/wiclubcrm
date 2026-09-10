"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";
import { useT } from "@/components/i18n/LocaleProvider";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";

const initialState: AuthFormState = { error: null, message: null };

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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-surface-2 px-4 py-16">
      <LocaleScope scope="network" fallback="ru" />
      <p className="max-w-sm text-center font-display text-lg italic text-ink-2">
        {t("loginTagline")}
      </p>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <span className="mb-2 block h-0.5 w-8 rounded-full bg-accent" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              WI Club CRM
            </h1>
          </div>
          <LocaleSwitcher />
        </div>
        <p className="mt-1 text-sm text-muted">
          {t(mode === "signin" ? "authSubtitleSignIn" : "authSubtitleSignUp")}
        </p>

        <div className="mt-6 flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              mode === "signin"
                ? "bg-background text-foreground shadow-sm"
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
                ? "bg-background text-foreground shadow-sm"
                : "text-muted"
            }`}
          >
            {t("authSubtitleSignUp")}
          </button>
        </div>

        {mode === "signin" ? (
          <form action={signInAction} className="mt-6 flex flex-col gap-4">
            <Field label={t("fieldEmail")} name="email" type="email" />
            <Field label={t("fieldPassword")} name="password" type="password" />
            {state.error && <ErrorText text={state.error} />}
            <SubmitButton pending={signInPending} label={t("btnSignIn")} />
          </form>
        ) : (
          <form action={signUpAction} className="mt-6 flex flex-col gap-4">
            <Field label={t("fieldFullName")} name="full_name" type="text" />
            <Field label={t("fieldEmail")} name="email" type="email" />
            <Field
              label={t("fieldPassword")}
              name="password"
              type="password"
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
  );
}

function Field({
  label,
  name,
  type,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        required
        minLength={minLength}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
      className="mt-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}
