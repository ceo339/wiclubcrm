import { cookies } from "next/headers";
import type { Profile } from "@/lib/auth";
import { isNetworkRole, VIEW_SCOPE_COOKIE } from "@/lib/role";

export { isNetworkRole, VIEW_SCOPE_COOKIE };

/**
 * The one club an hq/viewer account has narrowed every tab down to via the
 * city switcher — null means "все города" (no narrowing, the existing
 * network-wide behaviour). Always null for a partner account: it already
 * only ever sees its own club via RLS, so the switcher doesn't apply to it
 * and isn't shown at all (see AppShell).
 */
export async function getViewScopePartnerId(profile: Pick<Profile, "role">): Promise<string | null> {
  if (!isNetworkRole(profile.role)) return null;
  const store = await cookies();
  const value = store.get(VIEW_SCOPE_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}
