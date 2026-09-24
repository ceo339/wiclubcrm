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

/**
 * The three non-owner account "presets" this page can create — round 37
 * (24 сен 2026). Anastasiia described exactly three profiles besides her
 * own: the existing read-only network viewer (role="viewer", unchanged
 * since Round 18), a new one that also sees the "Франчайзи" pipeline
 * read-only, and a "МПП" who works ONLY the franchise pipeline and should
 * never see any existing club's leads/members/payments at all. Each preset
 * maps to one (role, franchise_access) pair — see the migrations
 * add_staff_role_and_franchise_access + rename_franchise_only_role_to_
 * avoid_staff_collision for the full reasoning (role value ended up named
 * "franchise", not "staff" — that name was already reserved elsewhere in
 * this codebase for a future, unrelated "club employee" account type).
 * Exposing this as three named presets (rather than two raw dropdowns)
 * keeps the form foolproof: there is no way to accidentally create a
 * combination nobody asked for.
 */
export const TEAM_ACCESS_TYPES = ["network_view", "network_and_franchise_view", "franchise_edit"] as const;
export type TeamAccessType = (typeof TEAM_ACCESS_TYPES)[number];

const ACCESS_TYPE_TO_ROLE: Record<TeamAccessType, string> = {
  network_view: "viewer",
  network_and_franchise_view: "viewer",
  franchise_edit: "franchise",
};

const ACCESS_TYPE_TO_FRANCHISE: Record<TeamAccessType, string> = {
  network_view: "none",
  network_and_franchise_view: "view",
  franchise_edit: "edit",
};

function accessTypeOf(role: string, franchiseAccess: string): TeamAccessType | null {
  const entry = (Object.entries(ACCESS_TYPE_TO_ROLE) as [TeamAccessType, string][]).find(
    ([type, r]) => r === role && ACCESS_TYPE_TO_FRANCHISE[type] === franchiseAccess
  );
  return entry?.[0] ?? null;
}

export type TeamAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: string;
  franchise_access: string;
  /** null when role/franchise_access don't match any of the three known
   * presets — shouldn't normally happen from this UI, but kept honest
   * rather than guessing if the combination was ever changed by hand. */
  access_type: TeamAccessType | null;
};

/**
 * HQ-only: lists every non-owner team account — both the original
 * "viewer" role (Round 18) and the new "franchise" role (Round 37, franchise-
 * only accounts). profiles has no email column (that lives only in
 * Supabase Auth), so this is the one place that needs the admin client
 * just to read — getUserById per row, not exposed any other way through
 * postgrest. The list itself is fetched with the caller's own RLS-scoped
 * client first (profiles_select already lets hq read every profile), so
 * this still 404s cleanly for a non-hq caller instead of silently using
 * the admin client's bypass to read something it shouldn't.
 */
export async function listTeamAccounts(): Promise<TeamAccount[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "hq") return [];

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, created_at, role, franchise_access")
    .in("role", ["viewer", "franchise"])
    .order("created_at", { ascending: false });
  if (!profiles || profiles.length === 0) return [];

  const withAccessType = (p: (typeof profiles)[number], email: string | null): TeamAccount => ({
    ...p,
    email,
    access_type: accessTypeOf(p.role, p.franchise_access),
  });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return profiles.map((p) => withAccessType(p, null));
  }

  return Promise.all(
    profiles.map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return withAccessType(p, data.user?.email ?? null);
    })
  );
}

/**
 * HQ-only: creates a new team-access login from one of the three presets
 * above (see TEAM_ACCESS_TYPES). No partner_id is set (same shape as an hq
 * account) — user_metadata.role/franchise_access are enough:
 * handle_new_user() already reads both columns generically for any role
 * (Round 37 extended it to also read franchise_access), so the matching
 * profiles row is created by the same trigger the partner-login flow
 * relies on, no extra insert here.
 */
export async function createTeamAccess(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const accessTypeRaw = String(formData.get("access_type") || "");
  if (!fullName) return { error: "errEnterViewerName" };
  if (!email) return { error: "errEnterLoginEmail" };
  if (!TEAM_ACCESS_TYPES.includes(accessTypeRaw as TeamAccessType)) {
    return { error: "errNotAuthorized" };
  }
  const accessType = accessTypeRaw as TeamAccessType;

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
    user_metadata: {
      role: ACCESS_TYPE_TO_ROLE[accessType],
      full_name: fullName,
      franchise_access: ACCESS_TYPE_TO_FRANCHISE[accessType],
    },
  });
  if (userError) return { error: "errCreateLoginFailed", errorDetail: userError.message };

  revalidatePath("/partners");
  return { error: null, tempPassword, resetEmail: email };
}

/** HQ-only: same reset-password mechanics as resetPartnerPassword, for a
 * team-access login (viewer or franchise role) instead of a club login. */
export async function resetTeamAccessPassword(accountId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  // Security audit (23 сен, раунд 36): accountId comes straight from the
  // client, so an admin-client call here must not trust it — verify it
  // really names a "viewer"/"franchise" profile first (same pattern already
  // used by resetPartnerPassword, which checks role = "partner" before
  // touching Auth). Without this, any authenticated HQ account could reset
  // the password of ANY Supabase Auth user by id, not just a team-access
  // account's — e.g. a partner login or another HQ login.
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", accountId)
    .in("role", ["viewer", "franchise"])
    .maybeSingle();
  if (!account) return { error: "errViewerNotFound" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const tempPassword = generateTempPassword();
  const { data: userData, error: userError } = await admin.auth.admin.updateUserById(accountId, {
    password: tempPassword,
  });
  if (userError) return { error: "errCreateLoginFailed", errorDetail: userError.message };

  return { error: null, tempPassword, resetEmail: userData.user?.email ?? null };
}

/**
 * HQ-only: revokes a team-access login entirely — deletes the Supabase
 * Auth user, which cascades to its profiles row (profiles_id_fkey ... on
 * delete cascade), so nothing is left behind to clean up separately.
 */
export async function deleteTeamAccess(accountId: string): Promise<{ error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errHqOnlyManageViewers" };

  // Same reasoning as resetTeamAccessPassword above (security audit, 23
  // сен, раунд 36) — never call admin.auth.admin.deleteUser on a
  // client-supplied id without confirming it's actually a team-access
  // account first.
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", accountId)
    .in("role", ["viewer", "franchise"])
    .maybeSingle();
  if (!account) return { error: "errViewerNotFound" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "errSupabaseServiceKeyMissing" };
  }

  const { error } = await admin.auth.admin.deleteUser(accountId);
  if (error) return { error: error.message };

  revalidatePath("/partners");
  return { error: null };
}
