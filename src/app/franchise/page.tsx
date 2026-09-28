import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isNetworkRole } from "@/lib/role";
import T from "@/components/i18n/T";
import FranchiseBoard from "@/components/franchise/FranchiseBoard";
import AppShell from "@/components/shell/AppShell";
import { FRANCHISE_SCOPE_VALUE } from "@/components/shell/CityScopeSwitcher";
import { QUALIFYING_STAGES } from "@/lib/franchise";

/**
 * «Франчайзи» — round 38's franchise-candidate pipeline, deferred out of
 * round 37 on purpose ("Сначала права доступа, потом сам раздел",
 * Anastasiia). Access is gated purely by profile.role/franchise_access
 * (same fields the RLS policies on franchise_candidates read via
 * is_hq()/can_view_franchise()/can_edit_franchise()) — not by partner_id,
 * since this pipeline has nothing to do with any one club: it's HQ's own
 * intake of prospective new franchisees, so every row here is visible
 * network-wide to whoever has franchise access, never scoped per club the
 * way /leads is.
 */
export default async function FranchisePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const isHq = profile.role === "hq";
  const canEdit = isHq || profile.franchise_access === "edit";
  const canView = canEdit || profile.franchise_access === "view";
  if (!canView) redirect("/");

  const supabase = await createClient();
  const { data: candidates, error } = await supabase
    .from("franchise_candidates")
    .select("*")
    .order("submitted_at", { ascending: false });

  // "Квалифицированные" (round 40) — "туда переносить всех, кто на стадии
  // Фин. модель отправлена или прошел эту стадию". Her decision when asked
  // via AskUserQuestion: by HISTORY, not just current stage — someone who
  // reached "Фин. модель отправлена" and later got "Отказ"/"Пауза" still
  // counts. Union of two signals: (a) current stage is already
  // fin_model_sent-or-later, and (b) franchise_stage_history has ever
  // logged a transition into one of those stages (covers a since-declined/
  // paused candidate whose current stage no longer shows it).
  const { data: qualifyingHistory } = await supabase
    .from("franchise_stage_history")
    .select("candidate_id")
    .in("stage", QUALIFYING_STAGES);
  const qualifiedIds = Array.from(
    new Set([
      ...(qualifyingHistory ?? []).map((r) => r.candidate_id),
      ...(candidates ?? []).filter((c) => QUALIFYING_STAGES.includes(c.stage as (typeof QUALIFYING_STAGES)[number])).map((c) => c.id),
    ])
  );

  // Round 38 follow-up — an hq/viewer account also gets the club switcher
  // here (same header widget every other network page shows), pre-selected
  // to "Франчайзи" (see CityScopeSwitcher) so it reflects where they
  // actually are instead of reverting to "Все клубы"/silently showing
  // nothing selected.
  const { data: switcherClubs } = isNetworkRole(profile.role)
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  return (
    <AppShell
      profile={profile}
      title={<T k="navFranchise" />}
      clubs={switcherClubs ?? []}
      activeClubId={FRANCHISE_SCOPE_VALUE}
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          <T k="errLoadFranchiseFailed" />: {error.message}
        </p>
      ) : (
        <FranchiseBoard initialCandidates={candidates ?? []} canEdit={canEdit} qualifiedIds={qualifiedIds} />
      )}
    </AppShell>
  );
}
