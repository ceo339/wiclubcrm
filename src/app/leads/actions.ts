"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SOURCES, duplicateKey, normalizeEmail, normalizePhone, type DuplicateField, type StageId } from "@/lib/leads";
import { currentMonthYear } from "@/lib/members";
import { todayIso } from "@/lib/payments";
import { findOrCreateContact, loadContactHistory, type ContactHistory } from "@/lib/server/contacts";
import { syncEnrollmentPayment } from "@/app/members/actions";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

function normalizeSource(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const match = SOURCES.find((s) => s.toLowerCase() === trimmed.toLowerCase());
  // A CSV column that doesn't match one of the app's five built-in sources
  // used to be dropped to null on import ("Юду", "Авито", a partner's own
  // channel name — anything outside Instagram/Facebook/Referral/Website/
  // Event just vanished). `leads.source` has no DB constraint and
  // sourceLabel/sourceColor (lib/leads.ts) already render an arbitrary
  // string gracefully, so there's no reason to discard real data — keep it
  // as-is instead (capped defensively in case a CSV cell is huge/garbled).
  return match ?? trimmed.slice(0, 60);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ReserveLeadRow = {
  id: string;
  partner_id: string | null;
  value: number | string | null;
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
async function reserveAwaitingEnrollment(supabase: SupabaseServerClient, lead: ReserveLeadRow): Promise<void> {
  if (!lead.partner_id || !lead.product_id) return;

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

  if (!reserveMemberId) return;

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
    await supabase.from("member_enrollments").insert({
      partner_id: lead.partner_id,
      member_id: reserveMemberId,
      product_id: lead.product_id,
      start_date: lead.cohort_start_date,
      price: Number(lead.value) || 0,
      status: "sAwaiting",
      paid: false,
      attended: [],
    });
  }
}

/**
 * "Смотри задвоились оплаты" (Anastasiia, 15 сен 2026) — a lead that reaches
 * "Оплата" before it has a matching course enrollment falls back to a bare
 * lead_id-keyed payment (see the `else if` branch in promotePaidLead below,
 * gated on the lead having a value but no matched course/enrollment yet). If
 * that same lead is later properly converted — a course/enrollment gets
 * matched or created and syncEnrollmentPayment records its own
 * enrollment-keyed payment — nothing used to remove the old fallback row, so
 * the same money showed up twice in Оплаты (and in every revenue total):
 * once keyed by lead_id (member_id/enrollment_id both null), once keyed by
 * enrollment_id. Confirmed live for two leads (Ася, Марина Чобанян) — each
 * had exactly this pair, the second created ~20 minutes after the first.
 *
 * Both promotePaidLead and convertLeadToMember — the two places that can
 * create a real enrollment-keyed payment — call this right after doing so,
 * to delete that now-redundant fallback row. Scoped tightly (this lead_id,
 * AND enrollment_id AND member_id both null) so it only ever touches the
 * specific fallback shape that `else if` branch creates, never a legitimate
 * payment that happens to reference this lead.
 */
async function cleanupOrphanLeadPayment(supabase: SupabaseServerClient, leadId: string): Promise<void> {
  await supabase.from("payments").delete().eq("lead_id", leadId).is("enrollment_id", null).is("member_id", null);
}

/**
 * Everything that happens once a lead is (or becomes) ready to be treated as
 * paid: reserve+promote her course seat to a real paid enrollment and record
 * the payment, or — if she has no course at all — the legacy lead_id-keyed
 * payment fallback. `partnerId` is passed separately (not read off `lead`)
 * so this can be called with a plain non-null string from either caller
 * without TypeScript losing track of the narrowing across the call.
 *
 * Shared by two different moments that can each be the one that finally
 * makes a lead "ready": updateLeadStage below (the stage itself changing to
 * "Оплата") and updateLead (course/поток/сумма filled in — or corrected —
 * on a lead that was already sitting at "Оплата"). "если уже прописан курс
 * и поток и сумма и стадия оплата - чтоб участницей становилась автоматом"
 * (Anastasiia, 15 сен 2026) — before this, a lead that reached "Оплата"
 * without a course already attached (dragged straight there, or the course
 * added only afterward through the edit form) just sat there with a bare
 * payments row and no member card, needing "Сделать участницей" clicked by
 * hand even though everything required was already filled in.
 */
async function promotePaidLead(
  supabase: SupabaseServerClient,
  leadId: string,
  partnerId: string,
  lead: ReserveLeadRow
): Promise<void> {
  if (lead.product_id && lead.cohort_start_date && Number(lead.value) > 0) {
    await reserveAwaitingEnrollment(supabase, lead);
  }

  // Found by contact, not by this lead's own lead_id (round 11, 13 сен
  // 2026) — same fix as reserveAwaitingEnrollment above, for the same
  // reason: a repeat заявка from someone who already has a member card
  // elsewhere needs to reuse it, or this falls through to the orphaned
  // lead_id-keyed payment below and creates a visible duplicate.
  let existingMember: { id: string } | null = null;
  if (lead.contact_id) {
    const { data } = await supabase.from("members").select("id").eq("contact_id", lead.contact_id).maybeSingle();
    existingMember = data;
  }
  if (!existingMember) {
    const { data } = await supabase.from("members").select("id").eq("lead_id", leadId).maybeSingle();
    existingMember = data;
  }

  // A pending "Ожидание" enrollment created when this lead reached
  // "Записалась" (see reserveAwaitingEnrollment above) becomes "Оплачено"
  // the moment the lead itself reaches "Оплата" — forward-only, only ever
  // moves an sAwaiting row, so a status she already changed by hand
  // (declined, refunded, completed…) is never touched by this. Matched by
  // product **and** поток (start_date), same reasoning as
  // reserveAwaitingEnrollment — otherwise a fresh signup for a later
  // поток of the same course could get merged into an old, already-paid
  // enrollment instead of getting its own payment.
  let matchedEnrollment: { id: string; status: string; price: number; memberId: string } | null = null;
  if (existingMember && lead.product_id) {
    let pendingQuery = supabase
      .from("member_enrollments")
      .select("id, status, price")
      .eq("member_id", existingMember.id)
      .eq("product_id", lead.product_id);
    pendingQuery = lead.cohort_start_date
      ? pendingQuery.eq("start_date", lead.cohort_start_date)
      : pendingQuery.is("start_date", null);
    const { data: pendingEnrollment } = await pendingQuery.maybeSingle();

    if (pendingEnrollment) {
      let status = pendingEnrollment.status;
      let price = Number(pendingEnrollment.price);
      const leadValue = Number(lead.value) || 0;
      if (status === "sAwaiting") {
        // "бери за изначальные значения сумму, которую я прописываю в
        // карточке лида" (Anastasiia, 13 сен 2026) — the seat was very
        // possibly reserved at 0/whatever "Сумма" was back then; refresh
        // it from whatever's on the lead RIGHT NOW, at the moment it's
        // actually marked paid, rather than trusting a stale number or
        // guessing at the course's list price.
        price = leadValue;
        await supabase
          .from("member_enrollments")
          .update({ status: "sPaid", paid: true, price })
          .eq("id", pendingEnrollment.id);
        status = "sPaid";
      } else if (leadValue > 0 && leadValue !== price) {
        // "почему её нет в оплатах?" (Anastasiia, 15 сен 2026, лид «Олеся
        // Горбачева») — a lead can reach "Оплата" (and get promoted to
        // sPaid above) BEFORE "Сумма" is ever filled in — dragged straight
        // there at 0, exactly like this case — and freezing the
        // enrollment's price at that moment meant syncEnrollmentPayment
        // below always saw price 0 and silently never created a payment,
        // even after Anastasiia went back and filled in the real sum
        // afterwards. Now, every time this function re-runs on an already
        // sPaid enrollment (every save of the lead card — see updateLead's
        // own call further down) and the lead's current Сумма is a real
        // positive number that disagrees with what's stored, the
        // enrollment's price is refreshed to match. Never runs the other
        // way — a real stored price is never zeroed out just because
        // Сумма happens to read 0/blank at the moment of an unrelated
        // edit.
        price = leadValue;
        await supabase.from("member_enrollments").update({ price }).eq("id", pendingEnrollment.id);
      }
      matchedEnrollment = { id: pendingEnrollment.id, status, price, memberId: existingMember.id };
    }
  }

  // "нет данных по оплатам за июль, хотя были они" (Anastasiia, 13 сен
  // 2026) — this used to stop at flipping the enrollment's status; it
  // never created the matching `payments` row, so the block below (kept
  // only as a fallback now) wrote a payment keyed by lead_id, gated on
  // the LEAD's own `value` — which can be 0 even though the enrollment
  // itself has a real price (e.g. the price was only ever set via
  // "Сделать участницей"/the member card, not on the lead itself). When
  // this lead has a real course enrollment, that enrollment — not the
  // lead's `value` — is now the one source of truth for its payment,
  // recorded through the same idempotent-by-enrollment_id helper the
  // member card already uses (`syncEnrollmentPayment`), so a lead with a
  // course never also creates a second, duplicate lead_id-keyed payment
  // for the same money. This also quietly backfills a payment for an
  // enrollment that was already sPaid/sCompleted from an earlier stage
  // change, if one was somehow still missing.
  if (matchedEnrollment) {
    await syncEnrollmentPayment(supabase, {
      partnerId,
      memberId: matchedEnrollment.memberId,
      enrollmentId: matchedEnrollment.id,
      productId: lead.product_id,
      price: matchedEnrollment.price,
      status: matchedEnrollment.status,
    });
    // See cleanupOrphanLeadPayment above — this lead may already have an
    // old lead_id-keyed fallback payment from before it had a matched
    // course/enrollment; the enrollment-keyed one above is now the real
    // record, so drop the stale duplicate.
    await cleanupOrphanLeadPayment(supabase, leadId);
  } else if (Number(lead.value) > 0) {
    // No course chosen on this lead at all — the pre-round-8 fallback:
    // one payment per lead, keyed by lead_id, using the lead's own value.
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!existingPayment) {
      await supabase.from("payments").insert({
        partner_id: partnerId,
        lead_id: leadId,
        member_id: existingMember?.id ?? null,
        product_id: lead.product_id,
        // `lead.value` is typed as `number | string | null` (ReserveLeadRow,
        // above) — a CSV import or a form field can hand this in as a
        // string — but the `payments.amount` column (and its generated
        // Supabase type) is a plain `number`. This coercion was missing
        // entirely before, which built fine locally (this project has never
        // had a compiler available in development) but failed Vercel's own
        // `npm run build` type-check the first time this code path actually
        // ran there (`TS2322`, 15 сен 2026) — same class of gap as the one
        // `convertLeadToMember` already works around (see its own comment
        // on `partnerId`, round 22).
        amount: Number(lead.value) || 0,
        status: "paid",
        paid_date: todayIso(),
      });
    }
  }
}

/**
 * Moves a lead to a new stage. RLS enforces that only the owning partner
 * can write to a lead — an HQ account (no partner_id) will simply be
 * rejected by the database, which is the correct behaviour (HQ is a
 * read-only aggregate view for now).
 */
export async function updateLeadStage(
  leadId: string,
  stage: StageId,
  decline?: { reason: string; note: string | null }
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      stage,
      decline_reason: stage === "declined" ? decline?.reason ?? null : null,
      decline_note: stage === "declined" ? decline?.note ?? null : null,
    })
    .eq("id", leadId)
    .select(
      "id, partner_id, value, product_id, cohort_start_date, name, phone, email, city, birthday, country, contact_id, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term"
    )
    .maybeSingle();

  if (error) return { error: error.message };

  // Round 19: the same course-selection prompt (see LeadDetailModal/
  // KanbanBoard) now also fires on "Выставлен счет" (invoiced), not just
  // "Записалась" — a lead can reach invoiced without ever passing through
  // presented first, so the reservation this triggers has to fire on
  // either stage, or a course picked at invoiced would never create a
  // "Ожидание" row in Участницы until (if ever) it later reaches "Оплата".
  if ((stage === "presented" || stage === "invoiced") && updated && updated.partner_id && updated.product_id) {
    await reserveAwaitingEnrollment(supabase, updated);
  }

  // "Оплата в лидах создаёт запись в Платежах автоматически" (Anastasiia,
  // 11 сен 2026) — the moment a lead reaches "Оплата", it should show up
  // in the Платежи ledger without a separate manual step. Skipped when
  // there's no partner (hq can't write payments anyway).
  if (stage === "paid" && updated && updated.partner_id) {
    await promotePaidLead(supabase, leadId, updated.partner_id, updated);
  }

  revalidatePath("/leads");
  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath("/");
  return { error: null };
}

export type CreateLeadResult = ActionResult & { contactHistory?: ContactHistory | null };

/**
 * Creates a new lead (заявка). Always creates it — a repeat inquiry from a
 * contact already on file is never blocked (Anastasiia, 11 сен 2026:
 * "Пусть добавляется заявка, но блокировка дубля только вручную, чтоб
 * партнер видел, что человек снова хочет и интересуется курсом"). What used
 * to be a hard block is now purely informational: the new lead is always
 * attached to a matching Контакт (or a fresh one), and if that contact
 * already has other leads/enrollments, they come back in `contactHistory`
 * for the form to show — any actual removal of a duplicate stays a manual
 * partner action (the existing HQ "Найти дубли" tool), never automatic.
 */
export async function createLead(formData: FormData): Promise<CreateLeadResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddLeads" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const source = normalizeSource(String(formData.get("source") || "Website")) ?? "Website";
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  let productId = String(formData.get("product_id") || "").trim() || null;
  let cohortStartDate = String(formData.get("cohort_start_date") || "").trim() || null;
  const plan = String(formData.get("plan") || "").trim() || null;

  const supabase = await createClient();

  // The product id/cohort date arrive via a hidden form field, so re-verify
  // the product actually belongs to this partner before trusting it.
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) {
      productId = null;
      cohortStartDate = null;
    }
  }

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      partner_id: profile.partner_id,
      name,
      phone,
      email,
      source,
      value,
      country,
      city,
      birthday,
      product_id: productId,
      cohort_start_date: cohortStartDate,
      plan,
      stage: "new",
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "errGeneric" };

  const contactId = await findOrCreateContact(supabase, profile.partner_id, {
    name,
    phone,
    email,
    city,
    birthday,
    country,
    // No utm_* here — the "Добавить лид" form only ever collects the
    // manually-picked source dropdown, never a real campaign; still a
    // genuine (if coarse) first-touch signal for the "Когорты" report.
    source,
  });
  if (contactId) await supabase.from("leads").update({ contact_id: contactId }).eq("id", inserted.id);

  const contactHistory = await loadContactHistory(supabase, contactId, inserted.id);

  revalidatePath("/leads");
  revalidatePath("/contacts");
  return { error: null, contactHistory };
}

export type ImportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  value?: number | null;
};

export type ImportResult = {
  error: string | null;
  imported: number;
  /** Only set when error === "errImportPartial" — see importLeads below. */
  partialFailure?: { total: number; message: string };
  /** Rows skipped because they matched an existing lead (email first, then
   * phone) or another row earlier in the same file. */
  duplicatesSkipped?: number;
  /** One entry per skipped row, so the partner can actually see *who* got
   * skipped and decide what to do with them (Anastasiia, 13 сен 2026: the
   * count alone wasn't enough — she needed to move the existing lead's
   * stage or attach a course herself). `existingLeadId` is null when the
   * row only repeated an earlier row in this same file — there's no
   * standalone lead to act on in that case, the first occurrence already
   * covers it. Capped defensively for a huge file. */
  duplicates?: ImportDuplicate[];
};

export type ImportDuplicate = {
  existingLeadId: string | null;
  existingName: string | null;
  existingStage: StageId | null;
  matchedField: DuplicateField;
  matchedValue: string;
  incomingName: string;
  incomingSource: string | null;
  incomingValue: number;
};

const MAX_REPORTED_DUPLICATES = 200;

const MAX_IMPORT_ROWS = 1000;
const IMPORT_CHUNK_SIZE = 200;

/**
 * Bulk-creates leads from parsed CSV rows (see ImportModal). Same RLS rule
 * as createLead — only a partner account (has partner_id) can insert.
 */
export async function importLeads(rows: ImportRow[]): Promise<ImportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized", imported: 0 };
  if (!profile.partner_id) {
    return {
      error: "errHqNoClubImportLeads",
      imported: 0,
    };
  }

  const clean = rows
    .map((r) => ({
      partner_id: profile.partner_id as string,
      name: (r.name || "").trim(),
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      source: normalizeSource(r.source),
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : 0,
      stage: "new" as const,
    }))
    .filter((r) => r.name.length > 0)
    .slice(0, MAX_IMPORT_ROWS);

  if (clean.length === 0) return { error: "errNoRowsWithName", imported: 0 };

  const supabase = await createClient();

  // Same email-first-then-phone rule as createLead, checked against both
  // this partner's existing leads and rows earlier in this same file (a
  // big CSV export can easily contain its own repeats).
  const { data: existing } = await supabase
    .from("leads")
    .select("id, name, stage, email, phone")
    .eq("partner_id", profile.partner_id as string);
  const existingByEmail = new Map<string, { id: string; name: string; stage: StageId }>();
  const existingByPhone = new Map<string, { id: string; name: string; stage: StageId }>();
  for (const l of existing ?? []) {
    const info = { id: l.id, name: l.name, stage: l.stage as StageId };
    const email = normalizeEmail(l.email);
    if (email && !existingByEmail.has(email)) existingByEmail.set(email, info);
    const phone = normalizePhone(l.phone);
    if (phone && !existingByPhone.has(phone)) existingByPhone.set(phone, info);
  }

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let duplicatesSkipped = 0;
  const duplicates: ImportDuplicate[] = [];
  const deduped = clean.filter((row) => {
    const key = duplicateKey(row.email, row.phone);
    if (!key) return true;
    const seen = key.field === "email" ? seenEmails : seenPhones;
    const existingMap = key.field === "email" ? existingByEmail : existingByPhone;
    if (seen.has(key.value) || existingMap.has(key.value)) {
      duplicatesSkipped++;
      if (duplicates.length < MAX_REPORTED_DUPLICATES) {
        const match = existingMap.get(key.value) ?? null;
        duplicates.push({
          existingLeadId: match?.id ?? null,
          existingName: match?.name ?? null,
          existingStage: match?.stage ?? null,
          matchedField: key.field,
          matchedValue: key.value,
          incomingName: row.name,
          incomingSource: row.source,
          incomingValue: row.value,
        });
      }
      return false;
    }
    seen.add(key.value);
    return true;
  });

  if (deduped.length === 0) {
    return {
      error: duplicatesSkipped > 0 ? "errImportAllDuplicates" : "errNoRowsWithName",
      imported: 0,
      duplicatesSkipped,
      duplicates,
    };
  }

  let imported = 0;
  for (let i = 0; i < deduped.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + IMPORT_CHUNK_SIZE);
    const { data: insertedRows, error, count } = await supabase
      .from("leads")
      .insert(chunk, { count: "exact" })
      .select("id, name, phone, email, source");
    if (error) {
      return {
        error: "errImportPartial",
        imported,
        partialFailure: { total: deduped.length, message: error.message },
        duplicatesSkipped,
        duplicates,
      };
    }
    imported += count ?? chunk.length;

    // Each imported row still gets a Контакт — matched against contacts
    // created earlier in this same import batch too, so 50 rows for the
    // same person (rare, but the CSV dedup above already covers the exact
    // email/phone case) don't spawn 50 contacts.
    for (const row of insertedRows ?? []) {
      const contactId = await findOrCreateContact(supabase, profile.partner_id as string, {
        name: row.name,
        phone: row.phone,
        email: row.email,
        source: row.source,
      });
      if (contactId) await supabase.from("leads").update({ contact_id: contactId }).eq("id", row.id);
    }
  }

  revalidatePath("/leads");
  revalidatePath("/contacts");
  return { error: null, imported, duplicatesSkipped, duplicates };
}

/**
 * Lightweight partner-scoped patch used from the import duplicates list
 * (ImportModal) — she matches a skipped CSV row to an existing lead and
 * either moves its stage (see updateLeadStage) or attaches the course the
 * new submission was for, without re-opening the full lead card. Only
 * touches product_id/cohort_start_date; everything else about the lead is
 * left as-is. The product is re-verified against this partner the same way
 * createLead does, since it ultimately comes from a client-supplied id.
 */
export async function assignLeadProduct(
  leadId: string,
  productId: string | null,
  cohortStartDate: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubEdit" };

  const supabase = await createClient();

  let verifiedProductId = productId;
  if (verifiedProductId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", verifiedProductId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) verifiedProductId = null;
  }

  const { error } = await supabase
    .from("leads")
    .update({
      product_id: verifiedProductId,
      cohort_start_date: verifiedProductId ? cohortStartDate : null,
    })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

/**
 * "и снова запись и выбрать курс не работает" (Anastasiia, 13 сен 2026) — a
 * lead that already sits on "Записалась" without a course (created before
 * this round's fix, or because the course prompt was skipped at the time)
 * had no way back in: reselecting the very same stage in the dropdown is a
 * no-op, so updateLeadStage's course prompt never got a second chance to
 * fire. This lets the lead card assign the missing course after the fact
 * and immediately reserves the seat on Участницы — exactly as if she'd
 * picked it at the moment of the original stage change.
 */
export async function assignLeadProductAndReserve(
  leadId: string,
  productId: string | null,
  cohortStartDate: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubEdit" };

  const supabase = await createClient();

  let verifiedProductId = productId;
  if (verifiedProductId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", verifiedProductId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) verifiedProductId = null;
  }

  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      product_id: verifiedProductId,
      cohort_start_date: verifiedProductId ? cohortStartDate : null,
    })
    .eq("id", leadId)
    .select(
      "id, partner_id, stage, value, product_id, cohort_start_date, name, phone, email, city, birthday, country, contact_id, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term"
    )
    .maybeSingle();

  if (error) return { error: error.message };

  // Round 19: also reserve when the course is (re)assigned to a lead
  // already sitting on "Выставлен счет" — same reasoning as updateLeadStage
  // above, this is the "Выбрать курс" banner's server call, used when a
  // lead is stuck on a course-requiring stage with none chosen yet.
  if (
    updated &&
    updated.partner_id &&
    (updated.stage === "presented" || updated.stage === "invoiced") &&
    updated.product_id
  ) {
    await reserveAwaitingEnrollment(supabase, updated);
  }

  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/");
  return { error: null };
}

/**
 * "нет, нужно перенести только этого лида на другой уже существующий поток"
 * (Anastasiia, 15 сен 2026) — corrects the first version of the lead card's
 * "reschedule" control, which called rescheduleCohort (products/actions.ts:
 * renames the поток's own date and cascades to EVERYONE on it). This is the
 * narrower sibling: it moves just this one lead — and, if she already has a
 * reserved/paid seat for this course, that one enrollment row — onto a
 * поток that already exists. Nobody else on either поток (old or new) is
 * touched. Only ever offered a real, already-existing `product_cohorts`
 * date for this lead's course (never an arbitrary typed date), since this
 * action never creates or renames a поток itself — see rescheduleCohort for
 * that, cascading, operation (used from the Курсы catalog instead).
 */
export async function moveLeadToCohort(leadId: string, newCohortStartDate: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubEdit" };

  const trimmed = newCohortStartDate.trim();
  if (!trimmed) return { error: "errEnterCohortStartDate" };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, product_id, cohort_start_date, contact_id")
    .eq("id", leadId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!lead) return { error: "errLeadNotFound" };
  if (!lead.product_id) return { error: "errCourseNotFound" };

  const { data: targetCohort } = await supabase
    .from("product_cohorts")
    .select("id")
    .eq("partner_id", profile.partner_id)
    .eq("product_id", lead.product_id)
    .eq("start_date", trimmed)
    .maybeSingle();
  if (!targetCohort) return { error: "errCourseNotFound" };

  const oldDate = lead.cohort_start_date;

  const { error } = await supabase.from("leads").update({ cohort_start_date: trimmed }).eq("id", leadId);
  if (error) return { error: error.message };

  // Move this same person's own enrollment along with her, if she already
  // has one for this course on the old поток (reserved on "Записалась"/
  // "Выставлен счёт", or already paid) — matched by contact, the same
  // canonical-person lookup used everywhere else (reserveAwaitingEnrollment,
  // updateLeadStage), not by lead_id, so a repeat заявка from someone who
  // already has a member card elsewhere still finds it.
  if (lead.contact_id) {
    const { data: member } = await supabase.from("members").select("id").eq("contact_id", lead.contact_id).maybeSingle();
    if (member) {
      let query = supabase
        .from("member_enrollments")
        .update({ start_date: trimmed })
        .eq("member_id", member.id)
        .eq("product_id", lead.product_id);
      query = oldDate ? query.eq("start_date", oldDate) : query.is("start_date", null);
      await query;
    }
  }

  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/contacts");
  revalidatePath("/attendance");
  return { error: null };
}

/**
 * Updates the editable contact/detail fields on a lead from the detail
 * card. Stage changes still happen via the kanban drag (updateLeadStage) —
 * this only covers the fields the prototype's lead drawer let you see and
 * amend directly.
 */
export async function updateLead(leadId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubEdit" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  // Unlike createLead, an unrecognised/empty source here is saved as null
  // (not defaulted to "Website") — this is an edit, and a lead that had no
  // source before shouldn't gain a fabricated one just for being saved.
  const source = normalizeSource(String(formData.get("source") || ""));
  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;
  let productId = String(formData.get("product_id") || "").trim() || null;
  let cohortStartDate = String(formData.get("cohort_start_date") || "").trim() || null;

  const supabase = await createClient();

  // Which course this заявка is actually for (Anastasiia, 13 сен 2026 —
  // needed on the lead card itself, not just at conversion time, since a
  // lead from an ad campaign should already say which product it's an
  // inquiry for). Re-verified against this partner the same way
  // createLead/assignLeadProduct do, since it's a client-supplied id.
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) {
      productId = null;
      cohortStartDate = null;
    }
  }
  if (!productId) cohortStartDate = null;

  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      name,
      phone,
      email,
      source,
      country,
      city,
      birthday,
      note,
      value,
      product_id: productId,
      cohort_start_date: cohortStartDate,
    })
    .eq("id", leadId)
    .select("contact_id, stage")
    .maybeSingle();

  if (error) return { error: error.message };

  // Lead and member are the same contact once she's been converted — keep
  // the shared fields (name/phone/email/city/birthday) mirrored onto her
  // member card too, so editing either one shows up in both (Anastasiia,
  // 11 сен 2026). member_since/stage/source/value/note stay one-sided:
  // those describe the funnel or the membership, not the person. The
  // Контакт row underneath both cards gets the same mirroring, so it stays
  // the canonical copy of the shared fields.
  await supabase.from("members").update({ name, phone, email, city, birthday }).eq("lead_id", leadId);
  if (updated?.contact_id) {
    await supabase.from("contacts").update({ name, phone, email, city, birthday, country }).eq("id", updated.contact_id);
  }

  // "если уже прописан курс и поток и сумма и стадия оплата - чтоб
  // участницей становилась автоматом" (Anastasiia, 15 сен 2026) — covers the
  // other direction from updateLeadStage's own use of promotePaidLead: a
  // lead that was already sitting at "Оплата" (reached it before the course/
  // поток/сумма were ever filled in — no way to "re-trigger" a stage change
  // to a stage it's already on) becomes a real Участница the moment those
  // fields are filled in or corrected right here on the edit form, without
  // "Сделать участницей" needing a manual click either.
  if (updated?.stage === "paid") {
    await promotePaidLead(supabase, leadId, profile.partner_id, {
      id: leadId,
      partner_id: profile.partner_id,
      value,
      product_id: productId,
      cohort_start_date: cohortStartDate,
      name,
      phone,
      email,
      city,
      birthday,
      country,
      contact_id: updated.contact_id,
    });
  }

  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/contacts");
  revalidatePath("/payments");
  return { error: null };
}

export type LeadDetail = {
  comments: Tables<"comments">[];
  tasks: Tables<"tasks">[];
  contactHistory: ContactHistory | null;
};

/**
 * Loads comments/tasks for one lead's detail card, fetched on demand when
 * the card opens rather than upfront with the whole leads list. Also loads
 * this lead's Контакт cross-history (other заявки/enrollments) — the direct
 * fix for "в Лидах нет информации о том, что этот лид уже проходил или куда
 * записан" (Anastasiia, 11 сен 2026).
 */
export async function getLeadDetail(leadId: string): Promise<LeadDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [], tasks: [], contactHistory: null };

  const supabase = await createClient();
  const { data: leadRow } = await supabase.from("leads").select("contact_id").eq("id", leadId).maybeSingle();
  const [{ data: comments }, { data: tasks }, contactHistory] = await Promise.all([
    supabase
      .from("comments")
      .select("*")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .order("due_date", { ascending: true }),
    loadContactHistory(supabase, leadRow?.contact_id ?? null, leadId),
  ]);

  return { comments: comments ?? [], tasks: tasks ?? [], contactHistory };
}

export async function addComment(leadId: string, text: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errCommentEmpty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const author = profile.full_name || user?.email || "Партнёр";

  const { error } = await supabase.from("comments").insert({
    partner_id: profile.partner_id,
    entity_type: "lead",
    entity_id: leadId,
    text: trimmed,
    author,
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export async function addTask(
  leadId: string,
  text: string,
  dueDate: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errEnterTaskText" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    partner_id: profile.partner_id,
    entity_type: "lead",
    entity_id: leadId,
    text: trimmed,
    due_date: dueDate || null,
    done: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type ConvertCourseChoice = {
  productId: string | null;
  cohortStartDate: string | null;
  price: number | null;
};

/**
 * Turns a won lead into a member — linked by members.lead_id, not a
 * one-way copy: the lead and the participant she becomes are the same
 * contact from here on (Anastasiia, 11 сен 2026 — "по сути это 1 контакт и
 * 1 карточка клиента"). `updateLead`/`updateMember` keep the shared contact
 * fields (name/phone/email/city/birthday) mirrored between the two rows
 * whichever card gets edited.
 *
 * Calling this again for a lead that's already linked to a member does NOT
 * create a second member — it used to, and that was a real bug: clicking
 * "Сделать участницей" a second time (e.g. after reopening the card) just
 * inserted a brand-new row every time, which is exactly how "Даниела
 * Василева" ended up with two duplicate participant cards. Now it just adds
 * the chosen course as another enrollment on her existing member card,
 * which is the right behaviour anyway since a member can hold several
 * course enrollments at once.
 *
 * `choice` is whatever course/cohort/price was picked in the convert
 * dialog (LeadDetailModal) — can differ from whatever was already on the
 * lead; omitting it falls back to the lead's own product_id/
 * cohort_start_date/value (pre-picker behaviour).
 */
export async function convertLeadToMember(
  leadId: string,
  choice?: ConvertCourseChoice
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };
  // Extracted into its own binding — TypeScript's narrowing of
  // `profile.partner_id` from the guard above doesn't reach into the
  // nested `async () => {...}` closure further down (the member_enrollments
  // insert branch), so that closure still sees `string | null` there and
  // fails the build (`error TS2322`, caught by Vercel 14 сен 2026, not by
  // this session's own manual review — this project has never had a
  // compiler available, see "Не проверено локальной сборкой" in the round
  // doc). A local `const` capturing the already-narrowed value sidesteps
  // that closure-narrowing gap everywhere in this function, not just at
  // the one spot that happened to fail the build.
  const partnerId = profile.partner_id;

  const supabase = await createClient();
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!lead) return { error: "errLeadNotFound" };

  const productId = choice ? choice.productId : lead.product_id;
  const cohortStartDate = choice ? choice.cohortStartDate : lead.cohort_start_date;
  const price = (choice ? choice.price : lead.value) ?? 0;

  // The chosen product id arrives from client state, so re-verify it
  // actually belongs to this partner before trusting it (same check as
  // createLead's product_id). No price fallback to the course's own list
  // price here — "бери за изначальные значения сумму, которую я прописываю
  // в карточке лида или контакта или участницы... участница могла и
  // бесплатно пойти" (Anastasiia, 13 сен 2026): 0 is a legitimate price
  // (a free seat), not something to silently override.
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!product) return { error: "errCourseNotFound" };
  }

  // Found by contact, not by this lead's own lead_id (round 11, 13 сен
  // 2026) — same fix as updateLeadStage/reserveAwaitingEnrollment: a repeat
  // заявка from someone who already has a member card elsewhere needs to
  // reuse it instead of spawning a disconnected second one.
  let existingMember: { id: string } | null = null;
  if (lead.contact_id) {
    const { data } = await supabase.from("members").select("id").eq("contact_id", lead.contact_id).maybeSingle();
    existingMember = data;
  }
  if (!existingMember) {
    const { data } = await supabase.from("members").select("id").eq("lead_id", leadId).maybeSingle();
    existingMember = data;
  }

  let memberId = existingMember?.id ?? null;

  // Every lead gets a contact_id on creation now, but this is a safety net
  // for any lead that somehow doesn't have one yet (e.g. one predating this
  // round's migration that the backfill missed).
  let contactId = lead.contact_id;
  if (!contactId) {
    contactId = await findOrCreateContact(supabase, partnerId, {
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

  if (!memberId) {
    const { data: member, error } = await supabase
      .from("members")
      .insert({
        partner_id: partnerId,
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

    if (error || !member) return { error: error?.message ?? "errGeneric" };
    memberId = member.id;
  }

  if (productId) {
    // A "Записалась" stage change (see updateLeadStage) may already have
    // reserved this exact member+course as a pending "Ожидание" enrollment
    // before she ever clicks this button — round 8, 13 сен 2026. Upgrade
    // that row to paid instead of inserting a second one for the same
    // course, which would otherwise leave one "Ожидание" and one
    // "Оплачено" enrollment sitting side by side for the same person.
    // Deliberately matched by product only (not поток/start_date, unlike
    // updateLeadStage's own matching) — this dialog lets her correct the
    // поток right here as part of converting, and that correction should
    // land on the same pending row, not spawn a second one next to it. A
    // genuinely new occurrence of the same course for someone who already
    // completed it before should go through a new заявка instead of this
    // button, so it gets its own enrollment via reserveAwaitingEnrollment.
    const { data: existingEnrollment } = await supabase
      .from("member_enrollments")
      .select("id")
      .eq("member_id", memberId)
      .eq("product_id", productId)
      .maybeSingle();

    let enrollmentId = existingEnrollment?.id ?? null;
    const enrollError = existingEnrollment
      ? (
          await supabase
            .from("member_enrollments")
            .update({ start_date: cohortStartDate, price, status: "sPaid", paid: true })
            .eq("id", existingEnrollment.id)
        ).error
      : await (async () => {
          const { data: inserted, error } = await supabase
            .from("member_enrollments")
            .insert({
              partner_id: partnerId,
              member_id: memberId,
              product_id: productId,
              start_date: cohortStartDate,
              price,
              status: "sPaid",
              paid: true,
              attended: [],
            })
            .select("id")
            .single();
          enrollmentId = inserted?.id ?? null;
          return error;
        })();

    if (enrollError) {
      revalidatePath("/leads");
      revalidatePath("/members");
      return { error: enrollError.message };
    }

    // "Сделать участницей" never created a `payments` row either (this bug
    // predates round 8 — round 6 only fixed the member-card entry points,
    // see syncEnrollmentPayment) — same idempotent-by-enrollment_id fix.
    if (enrollmentId) {
      await syncEnrollmentPayment(supabase, {
        partnerId,
        memberId,
        enrollmentId,
        productId,
        price: Number(price),
        status: "sPaid",
      });
      // See cleanupOrphanLeadPayment above — same duplicate-payment fix as
      // promotePaidLead, for this button's own path to a real enrollment.
      await cleanupOrphanLeadPayment(supabase, leadId);
    }
  }

  revalidatePath("/leads");
  revalidatePath("/members");
  revalidatePath("/contacts");
  return { error: null };
}

/**
 * Deletes a lead outright — deliberately hq-only (Anastasiia's own
 * decision: partner/club logins never get a delete button, only the
 * "Управляющая компания" login does). The `leads_delete_hq` RLS policy is
 * the real backstop; this check just fails fast with a translated message
 * instead of surfacing a raw Postgres permission error.
 */
export async function deleteLead(leadId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errOnlyHqCanDelete" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type DuplicateLeadRow = Tables<"leads"> & { partner_name: string | null };
export type DuplicateGroup = {
  key: string;
  field: DuplicateField;
  partnerName: string | null;
  leads: DuplicateLeadRow[];
};

/**
 * Scans every club's leads for duplicates, grouped per club — a lead at
 * Sofia and one at Batumi sharing an email isn't a duplicate, they're two
 * different clubs' bookings. Matched by the same email-first-then-phone
 * rule as createLead/importLeads (duplicateKey). HQ-only, since the only
 * thing you can do with a match (deleteLead) is HQ-only too.
 */
export async function findDuplicateLeads(): Promise<DuplicateGroup[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "hq") return [];

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("*, partners(name)")
    .order("added_date", { ascending: true });
  if (!leads) return [];

  const groups = new Map<string, DuplicateGroup>();
  for (const lead of leads) {
    const key = duplicateKey(lead.email, lead.phone);
    if (!key) continue;
    const partnerName = (lead as { partners?: { name: string } | null }).partners?.name ?? null;
    const groupKey = `${lead.partner_id}:${key.field}:${key.value}`;
    const row: DuplicateLeadRow = { ...lead, partner_name: partnerName };
    const existing = groups.get(groupKey);
    if (existing) existing.leads.push(row);
    else groups.set(groupKey, { key: groupKey, field: key.field, partnerName, leads: [row] });
  }

  return Array.from(groups.values()).filter((g) => g.leads.length > 1);
}
