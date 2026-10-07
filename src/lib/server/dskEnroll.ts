import { normalizeEmail } from "@/lib/leads";
import {
  chooseCohort,
  formatDateRu,
  isOnePlusOne,
  matchProduct,
  pickLead,
  samePhone,
  tidyPersonName,
  type LeadCandidate,
} from "@/lib/dskMatch";
import { addTaskOnce, chooseCohortTaskText } from "@/lib/server/autoTasks";
import { findOrCreateContact } from "@/lib/server/contacts";
import { recomputeEnrollmentStatus } from "@/lib/server/enrollmentPayments";
import { reserveAwaitingEnrollment, type Db } from "@/lib/server/leadEnrollment";

/**
 * Round 58 (6 Oct 2026) — «оплата → курс → участница», the part of the DSK
 * webhook after the payment row itself exists (see app/api/dsk/webhook).
 * Spec: claude/wiclub-crm-dsk-autoenroll-spec.md. Everything here runs with the
 * service_role client (a bank callback has no signed-in user), always AFTER the
 * payment was saved — so a failure anywhere in this file can never lose money:
 * the webhook catches it, logs it, and the payment stays in «Оплаты».
 *
 * Order of decisions (as agreed with Anastasiia):
 *   1. the person — by payerEmail, then payerPhone, through the club's Контакты
 *      (contact_id), then through the leads themselves; nobody found → a new
 *      contact and lead («DSK оплата», name from the cardholder);
 *   2. the course — the payment description (exact CRM name, then aliases),
 *      otherwise the course the lead already has; none → payment stays
 *      «Не привязана» and the club gets a task;
 *   3. lead → «Оплата», participant + enrolment («Оплачено»), payment linked
 *      to member / lead / course / enrolment;
 *   4. поток — exactly one upcoming поток → enrolled on it; otherwise the
 *      enrolment has no date yet and «Выбрать поток» (badge, filter, task);
 *   5. «1+1» in the description → task «Добавить подругу».
 */

const SOURCE_DSK = "DSK оплата";

const LEAD_COLUMNS =
  "id, partner_id, value, value_local, local_currency, product_id, cohort_start_date, name, phone, email, city, birthday, country, contact_id, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term";

export type DskEnrollInput = {
  db: Db;
  partnerId: string;
  paymentId: string;
  /** EUR, already divided by 100. */
  amount: number;
  description: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  cardholderName: string | null;
  /** «YYYY-MM-DD» in the club's time zone — the day the bank took the money. */
  paidDate: string;
  /** Today in the club's time zone (decides which потоки are still upcoming, task due dates). */
  today: string;
};

export type DskEnrollResult = {
  status: "paid_enrolled" | "paid_enrolled_choose_cohort" | "paid_unmatched_course";
  detail: string;
};

function money(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** `_` and `%` are wildcards in ILIKE — an e-mail such as ivan_petrov@… must match only itself. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The club's Контакт for this e-mail, else for this phone (same rule as findOrCreateContact). */
async function findContactId(
  db: Db,
  partnerId: string,
  email: string | null,
  phone: string | null
): Promise<string | null> {
  if (!email && !phone) return null;
  const { data } = await db.from("contacts").select("id, email, phone").eq("partner_id", partnerId);
  const contacts = data ?? [];
  if (email) {
    const byEmail = contacts.find((c) => normalizeEmail(c.email) === email);
    if (byEmail) return byEmail.id;
  }
  if (phone) {
    const byPhone = contacts.find((c) => samePhone(c.phone, phone));
    if (byPhone) return byPhone.id;
  }
  return null;
}

/** Leads of this person: through her contact, else matched on the lead's own e-mail/phone
 * (a lead made before contacts existed, or one a club typed in without a contact). */
async function findCandidateLeads(
  db: Db,
  partnerId: string,
  contactId: string | null,
  email: string | null,
  phone: string | null
): Promise<LeadCandidate[]> {
  const columns = "id, stage, product_id, created_at";
  if (contactId) {
    const { data } = await db.from("leads").select(columns).eq("partner_id", partnerId).eq("contact_id", contactId);
    if (data && data.length > 0) return data;
  }
  if (email) {
    const { data } = await db
      .from("leads")
      .select(columns)
      .eq("partner_id", partnerId)
      .ilike("email", escapeLike(email));
    if (data && data.length > 0) return data;
  }
  if (phone) {
    const { data } = await db
      .from("leads")
      .select(`${columns}, phone`)
      .eq("partner_id", partnerId)
      .not("phone", "is", null)
      .limit(5000);
    const hits = (data ?? []).filter((l) => samePhone(l.phone, phone));
    if (hits.length > 0) return hits;
  }
  return [];
}

export async function enrollDskPayment(input: DskEnrollInput): Promise<DskEnrollResult> {
  const { db, partnerId, paymentId, amount, description } = input;
  const email = normalizeEmail(input.payerEmail);
  const phone = input.payerPhone?.trim() || null;
  const notes: string[] = [];

  // --- the course named in the payment description -------------------------
  const { data: productRows } = await db.from("products").select("id, name, aliases").eq("partner_id", partnerId);
  const catalog = productRows ?? [];
  const match = matchProduct(description, catalog);
  const descriptionProduct = match.kind === "matched" ? match.product : null;
  if (match.kind === "matched") notes.push(`course_by=${match.via}`);
  if (match.kind === "ambiguous") notes.push(`course_ambiguous=${match.candidates.map((c) => c.name).join("|")}`);

  // --- the person and her lead --------------------------------------------
  let contactId = await findContactId(db, partnerId, email, phone);
  const candidates = await findCandidateLeads(db, partnerId, contactId, email, phone);
  const choice = pickLead(candidates, descriptionProduct?.id ?? null);

  let leadId: string;
  let leadCreated = false;
  if (choice.kind === "use") {
    leadId = choice.lead.id;
    notes.push(`lead_found${choice.setProduct ? "_set_course" : ""}`);
  } else {
    const personName = tidyPersonName(input.cardholderName) ?? (email ? email.split("@")[0] : null) ?? "Оплата DSK";
    if (!contactId) {
      contactId = await findOrCreateContact(db, partnerId, { name: personName, phone, email, source: SOURCE_DSK });
    }
    const { data: created, error } = await db
      .from("leads")
      .insert({
        partner_id: partnerId,
        contact_id: contactId,
        name: personName,
        phone,
        email,
        source: SOURCE_DSK,
        stage: "new",
        value: amount,
        product_id: descriptionProduct?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`lead insert failed: ${error?.message ?? "no row"}`);
    leadId = created.id;
    leadCreated = true;
    notes.push(`lead_created(${choice.reason})`);
  }

  const { data: lead, error: leadError } = await db.from("leads").select(LEAD_COLUMNS).eq("id", leadId).single();
  if (leadError || !lead) throw new Error(`lead read failed: ${leadError?.message ?? "no row"}`);

  // --- the course: the description first, then what the lead already has --
  const productId = descriptionProduct?.id ?? lead.product_id ?? null;
  const product = productId ? catalog.find((p) => p.id === productId) ?? null : null;

  if (!product) {
    // «Оплаты не терять никогда»: the payment stays, tied to the lead only, and the
    // club is told to link it (the lead itself is not moved — no course to enrol on).
    await db.from("payments").update({ lead_id: lead.id }).eq("id", paymentId);
    await addTaskOnce(db, {
      partnerId,
      entityType: "lead",
      entityId: lead.id,
      text: `Привязать оплату ${money(amount)} € от ${formatDateRu(input.paidDate)}`,
      dueDate: input.today,
    });
    return {
      status: "paid_unmatched_course",
      detail: `unmatched_course lead=${lead.id}${leadCreated ? " (new)" : ""} ${notes.join(" ")}`.trim(),
    };
  }

  // --- поток ----------------------------------------------------------------
  const { data: cohortRows } = await db
    .from("product_cohorts")
    .select("start_date")
    .eq("partner_id", partnerId)
    .eq("product_id", product.id);
  const cohortDates = (cohortRows ?? []).map((c) => c.start_date).sort();
  const cohort = chooseCohort(cohortDates, input.today, lead.cohort_start_date);

  // --- lead → «Оплата», participant, enrolment ------------------------------
  const { error: moveError } = await db
    .from("leads")
    .update({ product_id: product.id, cohort_start_date: cohort.cohortDate, value: amount, stage: "paid" })
    .eq("id", lead.id);
  if (moveError) throw new Error(`lead update failed: ${moveError.message}`);

  const reserved = await reserveAwaitingEnrollment(db, {
    ...lead,
    product_id: product.id,
    cohort_start_date: cohort.cohortDate,
    value: amount,
  });
  if (!reserved || !reserved.enrollmentId) throw new Error("enrolment was not created");

  // Link the payment first, then let the enrolment follow the money — the same
  // rule as round 53: not a partial payment → the поток's price = what was paid
  // (50 / 60 / 70 / 80 and any discount become her own price), status → «Оплачено».
  const { error: linkError } = await db
    .from("payments")
    .update({
      member_id: reserved.memberId,
      lead_id: lead.id,
      product_id: product.id,
      enrollment_id: reserved.enrollmentId,
    })
    .eq("id", paymentId);
  if (linkError) throw new Error(`payment link failed: ${linkError.message}`);
  // She paid again for a поток she had been refunded on: the old enrolment is reused,
  // so lift it out of «Возврат» — recompute only follows the money for the live statuses.
  const { data: reusedEnrollment } = await db
    .from("member_enrollments")
    .select("status")
    .eq("id", reserved.enrollmentId)
    .maybeSingle();
  if (reusedEnrollment?.status === "sRefunded") {
    await db.from("member_enrollments").update({ status: "sAwaiting", paid: false }).eq("id", reserved.enrollmentId);
  }
  await recomputeEnrollmentStatus(db, reserved.enrollmentId, { fullPayment: true });

  // --- tasks for the club ----------------------------------------------------
  const { data: member } = await db.from("members").select("name").eq("id", reserved.memberId).maybeSingle();
  const personName = member?.name ?? lead.name;

  if (isOnePlusOne(description)) {
    const label = /workshop/i.test(product.name) ? "Workshop 1+1" : `${product.name} 1+1`;
    await addTaskOnce(db, {
      partnerId,
      entityType: "member",
      entityId: reserved.memberId,
      text: `Добавить подругу: ${personName} — ${label}`,
      dueDate: input.today,
    });
    notes.push("one_plus_one_task");
  }
  if (cohort.needsCohort) {
    await addTaskOnce(db, {
      partnerId,
      entityType: "member",
      entityId: reserved.memberId,
      text: chooseCohortTaskText(personName, product.name),
      dueDate: input.today,
    });
  }

  const where = `lead=${lead.id}${leadCreated ? " (new)" : ""} member=${reserved.memberId} enrollment=${reserved.enrollmentId} course="${product.name}"`;
  return cohort.needsCohort
    ? { status: "paid_enrolled_choose_cohort", detail: `${where} cohort=choose ${notes.join(" ")}`.trim() }
    : { status: "paid_enrolled", detail: `${where} cohort=${cohort.cohortDate ?? "none"} ${notes.join(" ")}`.trim() };
}
