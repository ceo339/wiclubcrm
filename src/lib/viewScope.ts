import { cookies } from "next/headers";
import type { Profile } from "@/lib/auth";
import { isNetworkRole, VIEW_SCOPE_COOKIE, VIEW_MODE_COOKIE } from "@/lib/role";

export { isNetworkRole, VIEW_SCOPE_COOKIE, VIEW_MODE_COOKIE };

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

export type ViewMode = "franchise" | "clubs";

/**
 * "Кнопки крупнее на главной, же выбор показывать клубы или франчайзи. По
 * умолчанию главная — это франчайзи" (Anastasiia, round 42, 28 сен 2026) —
 * the top-level scope an hq/viewer account is in, read from its own cookie
 * (separate from VIEW_SCOPE_COOKIE, which only matters once "Клубы" is
 * picked). Defaults to "franchise" — a brand-new session, or one that
 * never touched the switcher, lands on the franchise dashboard, not the
 * club/network one. Every other role has no such toggle (see
 * CityScopeSwitcher, only ever rendered for isNetworkRole profiles), so
 * this is a flat "clubs" for them — nothing reads it for those roles
 * anyway, but a stable, unsurprising value beats an undefined one.
 */
export async function getViewMode(profile: Pick<Profile, "role">): Promise<ViewMode> {
  if (!isNetworkRole(profile.role)) return "clubs";
  const store = await cookies();
  return store.get(VIEW_MODE_COOKIE)?.value === "clubs" ? "clubs" : "franchise";
}
