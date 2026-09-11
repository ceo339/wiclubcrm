import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeScopeForProfile } from "@/lib/i18n";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import ContactsBoard from "@/components/contacts/ContactsBoard";
import AppShell from "@/components/shell/AppShell";

/**
 * "Контакты" — a standalone list of every person on file (from both Leads
 * and Members), separate from those two pages: Anastasiia's third approved
 * decision on the Contacts round (11 сен 2026, "Да, нужен отдельный раздел
 * «Контакты»"). A partner account can now edit a contact's shared fields
 * right from this card too (see updateContact in ./actions) — they still
 * mirror onto her Lead/Member rows exactly as editing from those cards
 * already does, so all three stay one person however she's approached.
 */
export default async function ContactsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq),
  // same as leads/members.
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "*, partners(name), leads(id, name, stage, added_date, product_id, cohort_start_date, products(name)), members(id, member_since, member_enrollments(id, status, start_date, product_id, products(name)))"
    )
    .order("created_at", { ascending: false });

  const localeScope = localeScopeForProfile(profile);
  const canEdit = !!profile.partner_id;

  return (
    <AppShell
      profile={profile}
      title={<T k="navContacts" />}
      headerExtra={
        <>
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          <T k="errLoadContactsFailed" />: {error.message}
        </p>
      ) : (
        <ContactsBoard
          initialContacts={(contacts ?? []).map((c) => {
            const raw = c as unknown as {
              partners?: { name: string } | null;
              leads?: {
                id: string;
                name: string;
                stage: string;
                added_date: string;
                product_id: string | null;
                cohort_start_date: string | null;
                products?: { name: string } | null;
              }[];
              members?: {
                id: string;
                member_since: string | null;
                member_enrollments?: {
                  id: string;
                  status: string;
                  start_date: string | null;
                  product_id: string | null;
                  products?: { name: string } | null;
                }[];
              }[];
            };
            const memberRow = (raw.members ?? [])[0] ?? null;
            const enrollments = (raw.members ?? []).flatMap((m) =>
              (m.member_enrollments ?? []).map((e) => ({
                id: e.id,
                product_id: e.product_id,
                product_name: e.products?.name ?? null,
                status: e.status,
                start_date: e.start_date,
              }))
            );
            return {
              ...c,
              partner_name: raw.partners?.name ?? null,
              member_id: memberRow?.id ?? null,
              member_since: memberRow?.member_since ?? null,
              leads: (raw.leads ?? []).map((l) => ({
                id: l.id,
                name: l.name,
                stage: l.stage,
                added_date: l.added_date,
                product_id: l.product_id,
                product_name: l.products?.name ?? null,
                cohort_start_date: l.cohort_start_date,
              })),
              enrollments,
            };
          })}
          isHq={profile.role === "hq"}
          canEdit={canEdit}
        />
      )}
    </AppShell>
  );
}
