import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeScopeForProfile } from "@/lib/i18n";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import EmailBoard from "@/components/email/EmailBoard";

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
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← <T k="appName" />
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            <T k="headingEmail" />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        <EmailBoard campaigns={campaigns ?? []} canEdit={canEdit} listSize={listSize} />
      </main>
    </div>
  );
}
