"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { ActionResult } from "./actions";

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
  }
  return out;
}

export type ViewerAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

/**
 * HQ-only: lists every "viewer" account (read-only, network-wide logins —
 * see Round 18, add_viewer_role_and_network_select_policies) with its
 * login email attached. profiles has no email column (that lives only in
 * Supabase Auth), so this is the one place that needs the admin client
 * just to read — getUserById per row, not exposed any other way through
 * postgrest. The list itself is fetched with the caller's own RLS-scoped
 * client first (profiles_select already lets hq read every profile), so
 * this still 404s cleanly for a non-hq caller instead of silently using
 * the admin client's bypass to read something it shouldn't.
 */
export async function listViewerAccounts(): Promise<ViewerAccount[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "hq") return [];

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("role", "viewer")
    .order("created_at", { ascending: false });
  if (!profiles || profiles.length === 0) return [];

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return profiles.map((p) => ({ ...p, email: null }));
  }

  return Promise.all(
    profiles.map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return { ...p, email: data.user?.email ?? null };
    })
  );
}

/**
 * HQ-only: creates a new "viewer" login — full network read access (every
 * club, every tab), zero write/delete rights anywhere, no Партнёры access.
 * No partner_id is set (same shape as an hq account) — user_metadata.role
 * = "viewer" is enough: handle_new_user() already reads that column
 * generically for any role, so the matching profiles row is created by
 * the same trigger the partner-login flow relies on, no extra insert here.
 */
export async function createViewerAccess(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!fullName) return { error: "errEnterViewerName" };
  if (!email) return { error: "errEnterLoginEmail" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const tempPassword = generateTempPassword();
  const { error: userError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: "viewer", full_name: fullName },
  });
  if (userError) return { error: "errCreateLoginFailed", errorDetail: userError.message };

  revalidatePath("/partners");
  return { error: null, tempPassword, resetEmail: email };
}

/** HQ-only: same reset-password mechanics as resetPartnerPassword, for a
 * viewer login instead of a club login. */
export async function resetViewerPassword(viewerId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  // Security audit (23 сен, раунд 36): viewerId comes straight from the
  // client, so an admin-client call here must not trust it — verify it
  // really names a "viewer" profile first (same pattern already used by
  // resetPartnerPassword, which checks role = "partner" before touching
  // Auth). Without this, any authenticated HQ account could reset the
  // password of ANY Supabase Auth user by id, not just a viewer's — e.g.
  // a partner login or another HQ login.
  const supabase = await createClient();
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", viewerId)
    .eq("role", "viewer")
    .maybeSingle();
  if (!viewerProfile) return { error: "errViewerNotFound" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const tempPassword = generateTempPassword();
  const { data: userData, error: userError } = await admin.auth.admin.updateUserById(viewerId, {
    password: tempPassword,
  });
  if (userError) return { error: "errCreateLoginFailed", errorDetail: userError.message };

  return { error: null, tempPassword, resetEmail: userData.user?.email ?? null };
}

/**
 * HQ-only: revokes a viewer's access entirely — deletes the Supabase Auth
 * user, which cascades to its profiles row (profiles_id_fkey ... on delete
 * cascade), so nothing is left behind to clean up separately.
 */
export async function deleteViewerAccess(viewerId: string): Promise<{ error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  // Same reasoning as resetViewerPassword above (security audit, 23 сен,
  // раунд 36) — never call admin.auth.admin.deleteUser on a client-supplied
  // id without confirming it's actually a viewer account first.
  const supabase = await createClient();
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", viewerId)
    .eq("role", "viewer")
    .maybeSingle();
  if (!viewerProfile) return { error: "errViewerNotFound" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const { error } = await admin.auth.admin.deleteUser(viewerId);
  if (error) return { error: error.message };

  revalidatePath("/partners");
  return { error: null };
}
