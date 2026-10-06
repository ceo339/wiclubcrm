import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthYear } from "@/lib/members";
import { findOrCreateContact } from "@/lib/server/contacts";
import type { Database } from "@/types/database";

// Round 58 — moved here, unchanged in behaviour, out of leads/actions.ts
// (a "use server" file: everything it exports becomes a public server action,
// and this needs to be callable from the DSK payment webhook, which has no
// signed-in user and passes the service_role client). Both callers now share
// this one implementation of «reserve a seat on the course for this lead».

/** Either the cookie-based server client or the service_role admin client. */
export type Db = SupabaseClient<Database>;

export type ReservedEnrollment = { memberId: string; enrollmentId: string | null };

/** Round 56: a lead's «Сумма» in the club's currency, shaped for an enrollment row. */
export function leadLocal(lead: { value_local?: number | string | null; local_currency?: string | null }): {
  price_local: number | null;
  local_currency: string | null;
} {
  const n = lead.value_local === null || lead.value_local === undefined ? NaN : Number(lead.value_local);
  return Number.isFinite(n) && lead.local_currency
    ? { price_local: n, local_currency: lead.local_currency }
    : { price_local: null, local_currency: null };
}

export type ReserveLeadRow = {
  id: string;
  partner_id: string | null;
  value: number | string | null;
  /** Round 56: «Сумма» exactly as typed in the club's currency. */
  value_local?: number | string | null;
  local_currency?: string | null;
  product_id: string | null;
  cohort_start_date: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  birthday: string | null;
  country: string | null;
  contact_id: string | null;
  // First-touch attribution (round 27) — only read when this lead is the
  // one that ends up creating a brand-new Контакт below (see
  // reserveAwaitingEnrollment); an existing contact's first touch is never
  // touched from here.
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
};

/**
 * "Записалась" — reserve a pending course spot on Участницы (Anastasiia,
 * 13 сен 2026): a lead that has a course/поток chosen and has signed up,
 * but hasn't paid yet, should already show up there with status "Ожидание"
 * (sAwaiting). Only fires when the lead actually has a product — nothing to
 * reserve otherwise. Idempotent per member+product+поток: does nothing if
 * this exact enrollment already exists (repeated stage toggling, a lead
 * pulled back from "Оплата", or this helper being called a second time from
 * assignLeadProductAndReserve).
 *
 * Extracted as its own function (round 11, 13 сен 2026) so it can also run
 * when a course is assigned *after* the lead already sits on "Записалась" —
 * see assignLeadProductAndReserve below — not only at the moment of the
 * stage transition itself.
 *
 * Looks up the existing member by **contact**, not by this lead's own
 * `lead_id` — a repeat заявка from someone who is already a member
 * elsewhere has to reuse her existing card. Looking her up only by this
 * particular lead's `lead_id` (the pre-round-11 behaviour) never found her,
 * so this used to silently create a second, disconnected member/enrollment
 * for the same person every time she made a new заявка — the direct cause
 * of the duplicated Оплаты Anastasiia reported same day (13 сен 2026).
 */
export async function reserveAwaitingEnrollment(supabase: Db, lead: ReserveLeadRow): Promise<ReservedEnrollment | null> {
  if (!lead.partner_id || !lead.product_id) return null;

  let contactId = lead.contact_id;
  let reserveMemberId: string | null = null;
  if (contactId) {
    const { data } = await supabase.from("members").select("id").eq("contact_id", contactId).maybeSingle();
    reserveMemberId = data?.id ?? null;
  }
  if (!reserveMemberId) {
    const { data } = await supabase.from("members").select("id").eq("lead_id", lead.id).maybeSingle();
    reserveMemberId = data?.id ?? null;
  }

  if (!reserveMemberId) {
    if (!contactId) {
      contactId = await findOrCreateContact(supabase, lead.partner_id, {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        birthday: lead.birthday,
        country: lead.country,
        source: lead.source,
        utmSource: lead.utm_source,
        utmMedium: lead.utm_medium,
        utmCampaign: lead.utm_campaign,
        utmContent: lead.utm_content,
        utmTerm: lead.utm_term,
      });
      if (contactId) await supabase.from("leads").update({ contact_id: contactId }).eq("id", lead.id);
    }
    const { data: member } = await supabase
      .from("members")
      .insert({
        partner_id: lead.partner_id,
        lead_id: lead.id,
        contact_id: contactId,
        name: lead.name,
        city: lead.city,
        email: lead.email,
        phone: lead.phone,
        birthday: lead.birthday,
        member_since: currentMonthYear(),
      })
      .select("id")
      .single();
    reserveMemberId = member?.id ?? null;
  }

  if (!reserveMemberId) return null;

  // Matched by product **and** поток (start_date) — matching by product
  // alone would conflate a genuinely new signup for a later поток of the
  // same course with an old, already-completed one and silently skip
  // creating a new enrollment/payment for it (round 11, 13 сен 2026).
  let existingQuery = supabase
    .from("member_enrollments")
    .select("id")
    .eq("member_id", reserveMemberId)
    .eq("product_id", lead.product_id);
  existingQuery = lead.cohort_start_date
    ? existingQuery.eq("start_date", lead.cohort_start_date)
    : existingQuery.is("start_date", null);
  const { data: existingEnrollment } = await existingQuery.maybeSingle();

  if (!existingEnrollment) {
    // "бери за изначальные значения сумму, которую я прописываю в карточке
    // лида" (Anastasiia, 13 сен 2026) — a reserved seat can be genuinely
    // free, so this takes exactly what's on the lead's own "Сумма" right
    // now, 0 included, rather than guessing at the course's list price. If
    // she fills the sum in later, updateLead below refreshes this same
    // enrollment's price, and updateLeadStage's "Оплата" branch refreshes
    // it again at the moment of payment — so nothing ever gets stuck at a
    // wrong default.
    const { data: created } = await supabase
      .from("member_enrollments")
      .insert({
      partner_id: lead.partner_id,
      member_id: reserveMemberId,
      product_id: lead.product_id,
      start_date: lead.cohort_start_date,
      price: Number(lead.value) || 0,
      ...leadLocal(lead),
      status: "sAwaiting",
      paid: false,
      attended: [],
    })
      .select("id")
      .single();
    return { memberId: reserveMemberId, enrollmentId: created?.id ?? null };
  }
  return { memberId: reserveMemberId, enrollmentId: existingEnrollment.id };
}

/**
 * Round 58 — a payment the bank confirmed (`dsk_order_id` set) but the DSK
 * webhook could not link to a course stays on the lead alone («Не привязана»,
 * with a task for the club). When that lead later gets a real enrollment —
 * the club picks the course and moves her to «Оплата», or presses «Сделать
 * участницей» — the bank payment must BECOME that enrollment's payment, not be
 * deleted as an «orphan» and re-created at the course price (which would lose
 * the bank reference and could double-count if the bank repeats a callback).
 * Called right before the enrollment's own payment is synced.
 */
export async function adoptDskPayments(
  supabase: Db,
  leadId: string,
  link: { memberId: string; enrollmentId: string; productId: string | null }
): Promise<void> {
  await supabase
    .from("payments")
    .update({ member_id: link.memberId, enrollment_id: link.enrollmentId, product_id: link.productId })
    .eq("lead_id", leadId)
    .is("enrollment_id", null)
    .is("member_id", null)
    .not("dsk_order_id", "is", null);
}
