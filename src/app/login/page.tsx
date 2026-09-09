"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";

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

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-2 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          WI Club CRM
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin" ? "Вход в систему" : "Регистрация"}
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
            Вход
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
            Регистрация
          </button>
        </div>

        {mode === "signin" ? (
          <form action={signInAction} className="mt-6 flex flex-col gap-4">
            <Field label="Email" name="email" type="email" />
            <Field label="Пароль" name="password" type="password" />
            {state.error && <ErrorText text={state.error} />}
            <SubmitButton pending={signInPending} label="Войти" />
          </form>
        ) : (
          <form action={signUpAction} className="mt-6 flex flex-col gap-4">
            <Field label="Имя" name="full_name" type="text" />
            <Field label="Email" name="email" type="email" />
            <Field
              label="Пароль"
              name="password"
              type="password"
              minLength={6}
            />
            {state.error && <ErrorText text={state.error} />}
            {state.message && (
              <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
                {state.message}
              </p>
            )}
            <SubmitButton pending={signUpPending} label="Создать аккаунт" />
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
