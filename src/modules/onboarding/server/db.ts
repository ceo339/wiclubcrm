import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Единственное место, где код обращается к схеме `onboarding`.
 *
 * - onboardingReadDb: клиент с сессией пользователя, чтение идет через RLS
 *   (hq/viewer видят все, партнер только свой онбординг).
 * - onboardingWriteDb: admin-клиент (service_role). Только после проверки роли
 *   в серверном действии, как в «Финансах». Никогда не импортировать на клиенте.
 *
 * Клиенты не типизированы общим Database (там только `public`): строки описаны
 * в ../types.ts.
 */

export async function onboardingReadDb() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "onboarding" },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll() {
        // сессию обновляет middleware; здесь только читаем
      },
    },
  });
}

export function onboardingWriteDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, {
    db: { schema: "onboarding" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
