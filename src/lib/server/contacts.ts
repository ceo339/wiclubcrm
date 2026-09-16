// Server-only helpers for the Контакт (Contact) entity — the canonical
// person record that a Лид (a per-course inquiry/application) and a
// Участница (member) both point to via contact_id. Approved by Anastasiia
// 11 сен 2026: mirrors how HubSpot/Salesforce/Pipedrive separate Contact
// from Deal, so the same person can have several leads over time and every
// card can show her full cross-history.
//
// Not a "use server" file on purpose — these are plain helper functions
// called from within other server actions (leads/actions.ts,
// members/actions.ts, payments/actions.ts), not actions themselves.

import { duplicateKey, normalizeEmail, normalizePhone } from "@/lib/leads";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ContactPerson = {
  name: string;
  phone: string | null;
  email: string | null;
  city?: string | null;
  birthday?: string | null;
  country?: string | null;
  /**
   * First-touch attribution (round 27, 16 сен 2026 — "Да! Давай так как ты
   * предложила. По первому касанию считать"), for the "Когорты" report.
   * Only ever used on the CREATE path below — an existing contact's first
   * touch is never overwritten by a later lead/deal, even one from a
   * completely different campaign. Omit these entirely at a call site with
   * no real attribution data (a manually added contact/member, a payment
   * recorded by hand) rather than guessing; null here just means "not from
   * an ad", which is the honest answer for those paths.
   */
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

/**
 * The one place that decides "is this the same person" for Контакты — same
 * email-first-then-phone rule as lib/leads.ts's duplicateKey, scoped to one
 * partner/club. Returns an existing contact's id when found, otherwise
 * creates a fresh contact and returns its id.
 *
 * Never blocks the caller: per Anastasiia's decision, a repeat inquiry
 * always goes through — this only decides which Контакт it attaches to.
 * Callers that need to know it was a repeat should check loadContactHistory
 * on the returned id.
 */
export async function findOrCreateContact(
  supabase: SupabaseClient,
  partnerId: string,
  person: ContactPerson
): Promise<string | null> {
  const key = duplicateKey(person.email, person.phone);
  if (key) {
    const { data } = await supabase.from("contacts").select("id, email, phone").eq("partner_id", partnerId);
    const match = (data ?? []).find((c) =>
      key.field === "email" ? normalizeEmail(c.email) === key.value : normalizePhone(c.phone) === key.value
    );
    if (match) return match.id;
  }

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      partner_id: partnerId,
      name: person.name,
      phone: person.phone,
      email: person.email,
      city: person.city ?? null,
      birthday: person.birthday ?? null,
      country: person.country ?? null,
      first_source: person.source ?? null,
      first_utm_source: person.utmSource ?? null,
      first_utm_medium: person.utmMedium ?? null,
      first_utm_campaign: person.utmCampaign ?? null,
      first_utm_content: person.utmContent ?? null,
      first_utm_term: person.utmTerm ?? null,
    })
    .select("id")
    .single();

  return error || !created ? null : created.id;
}

export type ContactHistory = {
  contactId: string;
  /** This contact's other заявки (leads), excluding whichever one the
   * caller is currently looking at. */
  otherLeads: { id: string; name: string; stage: string }[];
  /** Every course this contact's member card (if any) is enrolled in. */
  enrollments: { productName: string | null; status: string }[];
};

/**
 * What proves "лид и участница — один контакт": every other lead this
 * person has ever made, and every course she's enrolled in — regardless of
 * which lead/member row you're currently looking at. Feeds the
 * informational repeat-contact notice on lead creation and the
 * cross-history sections on LeadDetailModal/MemberDetailModal.
 *
 * Returns null when there's genuinely nothing to show (a first-time,
 * not-yet-enrolled contact), so callers can skip rendering the section
 * entirely rather than showing an empty box.
 */
export async function loadContactHistory(
  supabase: SupabaseClient,
  contactId: string | null,
  excludeLeadId?: string
): Promise<ContactHistory | null> {
  if (!contactId) return null;

  let leadsQuery = supabase.from("leads").select("id, name, stage").eq("contact_id", contactId);
  if (excludeLeadId) leadsQuery = leadsQuery.neq("id", excludeLeadId);

  const [{ data: otherLeads }, { data: members }] = await Promise.all([
    leadsQuery,
    supabase.from("members").select("id, member_enrollments(status, products(name))").eq("contact_id", contactId),
  ]);

  const enrollments = (members ?? []).flatMap((m) =>
    (
      (m as { member_enrollments?: { status: string; products: { name: string } | null }[] }).member_enrollments ?? []
    ).map((e) => ({
      productName: e.products?.name ?? null,
      status: e.status,
    }))
  );

  if ((otherLeads ?? []).length === 0 && enrollments.length === 0) return null;

  return { contactId, otherLeads: otherLeads ?? [], enrollments };
}
