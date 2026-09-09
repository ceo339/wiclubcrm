"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error: string | null; message: string | null };

const EMPTY_STATE: AuthFormState = { error: null, message: null };

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ...EMPTY_STATE, error: error.message };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: "partner" } },
  });

  if (error) {
    return { ...EMPTY_STATE, error: error.message };
  }

  return {
    ...EMPTY_STATE,
    message:
      "Аккаунт создан. Пока свяжитесь с администратором, чтобы привязать его к клубу-партнёру, — самостоятельный онбординг ещё не готов.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
