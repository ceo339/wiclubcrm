import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin client using the Supabase service_role key — bypasses RLS entirely
 * and can create auth users directly (needed to give a new club a login
 * without them self-registering). This must NEVER be imported into a
 * client component; only Server Actions / Route Handlers may use it.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, a server-only env var (no
 * NEXT_PUBLIC_ prefix, so Next.js never bundles it to the browser). Set it
 * in Vercel's project settings — the value itself should never be pasted
 * into chat or committed to the repo.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
