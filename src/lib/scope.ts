/**
 * The "scope" a page's per-club preferences (currency, language) are filed
 * under — either the whole network ("network") or one specific club
 * ("club:<partnerId>"). Shared between currency and locale so a partner's
 * own club always means the same scope in both systems, and HQ's
 * mixed-club views always mean "network" in both — see currency.ts's
 * scopeForProfile and i18n.ts's localeScopeForProfile.
 */
export function clubScopeForProfile(profile: { role: string; partner_id: string | null }): string {
  if (profile.role !== "hq" && profile.partner_id) return `club:${profile.partner_id}`;
  return "network";
}
