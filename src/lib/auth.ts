import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles"> & {
  partner_name: string | null;
  /** The signed-in user's own club's country, when they belong to one —
   * used to default the currency switcher to that club's local currency
   * (e.g. Georgia's lari) on every page they see, without every page
   * having to fetch the partner row itself. Null for hq accounts, which
   * aren't tied to a single club/currency. */
  partner_country: string | null;
  /** Where a customer's reply to this club's campaign/direct emails should
   * land — see partners.reply_to_email. Null for hq accounts and for any
   * club that hasn't set one yet (Resend then falls back to its own
   * default, i.e. replies go to the shared From address, not this club's
   * real inbox). */
  partner_reply_to_email: string | null;
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
    .select("*, partners(name, country, reply_to_email)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    ...profile,
    partner_name: profile.partners?.name ?? null,
    partner_country: profile.partners?.country ?? null,
    partner_reply_to_email: profile.partners?.reply_to_email ?? null,
  };
}
