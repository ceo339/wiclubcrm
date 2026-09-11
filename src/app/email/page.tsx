import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeScopeForProfile } from "@/lib/i18n";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import EmailBoard from "@/components/email/EmailBoard";
import AppShell from "@/components/shell/AppShell";

export default async function EmailPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq, read-only, same convention as Leads/Members).
  const { data: campaigns } = await supabase
    .from("email_campaigns")
    .select("*, email_campaign_recipients(status)")
    .order("created_at", { ascending: false });

  const partnerId = profile.partner_id;
  const canEdit = !!partnerId;
  let listSize = { members: 0, leadsAll: 0 };
  if (partnerId) {
    const [{ data: members }, { data: leads }] = await Promise.all([
      supabase.from("members").select("id").eq("partner_id", partnerId).not("email", "is", null),
      supabase.from("leads").select("id").eq("partner_id", partnerId).not("email", "is", null),
    ]);
    listSize = { members: (members ?? []).length, leadsAll: (leads ?? []).length };
  }

  const localeScope = localeScopeForProfile(profile);

  return (
    <AppShell
      profile={profile}
      title={<T k="headingEmail" />}
      headerExtra={
        <>
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      <EmailBoard campaigns={campaigns ?? []} canEdit={canEdit} listSize={listSize} />
    </AppShell>
  );
}
