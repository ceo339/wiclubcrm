import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getViewMode } from "@/lib/viewScope";
import { localeScopeForProfile } from "@/lib/i18n";
import AppShell from "@/components/shell/AppShell";
import LocaleScope from "@/components/i18n/LocaleScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import T from "@/components/i18n/T";
import type { Profile } from "@/lib/auth";
import { canManageOnboarding, canMarkOnboarding } from "../access";
import { requireOnboardingAccess } from "../server/guard";
import { loadClubs, loadOnboarding, loadOverview, loadStartableCandidates, onboardingIdForPartner } from "../server/load";
import OnboardingOverview from "./OnboardingOverview";
import OnboardingPartner from "./OnboardingPartner";

async function shell(profile: Profile, body: ReactNode, opts: { subtitle?: ReactNode; back?: boolean } = {}) {
  const viewMode = await getViewMode(profile);
  const locale = localeScopeForProfile(profile);
  return (
    <AppShell
      profile={profile}
      title={<T k="navOnboarding" />}
      subtitle={opts.subtitle ?? <T k="onbSubtitle" />}
      viewMode={viewMode}
      backHref={opts.back ? "/onboarding" : undefined}
      backLabel={opts.back ? <T k="navOnboarding" /> : undefined}
      headerExtra={
        <>
          <LocaleScope scope={locale.scope} fallback={locale.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {body}
    </AppShell>
  );
}

async function guarded(): Promise<Profile> {
  const g = await requireOnboardingAccess("view");
  if ("error" in g) redirect(g.error === "errNotAuthorized" ? "/" : "/login");
  return g.profile;
}

/** /onboarding: обзор партнеров (hq/viewer); партнер сразу попадает на свой онбординг. */
export async function OnboardingIndexPage() {
  const profile = await guarded();
  if (profile.role === "partner") {
    const id = profile.partner_id ? await onboardingIdForPartner(profile.partner_id) : null;
    if (id) redirect(`/onboarding/${id}`);
    return shell(
      profile,
      <div className="rounded-xl border border-border bg-background p-10 text-center text-muted shadow-card">
        <T k="onbPartnerNone" />
      </div>
    );
  }
  const cards = await loadOverview();
  const manage = canManageOnboarding(profile.role);
  const [candidates, clubs] = manage ? await Promise.all([loadStartableCandidates(cards.map((c) => c.candidate_id)), loadClubs()]) : [[], []];
  return shell(profile, <OnboardingOverview cards={cards} canManage={manage} candidates={candidates} clubs={clubs} />);
}

/** /onboarding/[id]: страница одного партнера. */
export async function OnboardingDetailPage({ id }: { id: string }) {
  const profile = await guarded();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadOnboarding(id, profile);
  if (!data) notFound();
  const manage = canManageOnboarding(profile.role);
  const clubs = manage ? await loadClubs() : [];
  return shell(
    profile,
    <OnboardingPartner
      data={data}
      canMark={canMarkOnboarding(profile.role)}
      canManage={manage}
      isPartner={profile.role === "partner"}
      clubs={clubs}
    />,
    { subtitle: `${data.onb.city ?? ""}${data.onb.city ? " · " : ""}${data.candidate_name}`, back: profile.role !== "partner" }
  );
}
