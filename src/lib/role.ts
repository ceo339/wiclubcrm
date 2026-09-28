/**
 * Deliberately dependency-free (no next/headers, no supabase client) so it
 * can be imported from both Server Components/Actions AND client
 * components (e.g. AppShell, for the city switcher) without dragging in
 * anything server-only.
 *
 * Round 18 (15 сен 2026) added a "viewer" role alongside "hq": a
 * read-only, network-wide login (e.g. for a targetolog) that sees every
 * club on every board — same as hq — but can never write/delete anything
 * and has no access to club management. Everywhere the app used to write
 * `profile.role === "hq"` purely to decide "show the combined, all-clubs
 * view" (not to gate an actual write/delete action) should use this
 * instead. Places gating a real admin action (delete a lead/contact,
 * manage Партнёры, reset a password) must keep comparing
 * `profile.role === "hq"` directly — DO NOT swap those to this helper.
 */
export function isNetworkRole(role: string): boolean {
  return role === "hq" || role === "viewer";
}

/** Cookie name for the city switcher in AppShell/CityScopeSwitcher — lives
 * here (not in viewScope.ts) specifically so the client-side switcher can
 * import just the string without pulling in viewScope.ts's next/headers
 * dependency into the client bundle. */
export const VIEW_SCOPE_COOKIE = "hqCityFilter";

/**
 * Round 42 (28 сен 2026) — the top-level "Франчайзи" / "Клубы" scope
 * toggle, separate from VIEW_SCOPE_COOKIE (which city, if any, once
 * "Клубы" is picked). Same reasoning as above for living here instead of
 * viewScope.ts. Only ever consulted for hq/viewer accounts — see
 * getViewMode in viewScope.ts, which defaults it to "franchise".
 */
export const VIEW_MODE_COOKIE = "hqViewMode";
