import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles"> & {
  partner_name: string | null;
};

/**
 * Loads the signed-in user's profile (role + partner_id) for use in Server
 * Components / Server Actions. Returns null if not signed in — callers that
 * require auth should redirect (middleware already does this for pages, but
 * Server Actions need their own check since middleware doesn't run for them
 * the same way).
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, partners(name)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    ...profile,
    partner_name: profile.partners?.name ?? null,
  };
}
