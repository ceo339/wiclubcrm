"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { STATUSES, todayIso } from "@/lib/payments";
import { findOrCreateContact } from "@/lib/server/contacts";

export type ActionResult = { error: string | null };
export type PaymentLinkResult = { error: string | null; url?: string };

function normalizeStatus(raw: string | undefined | null): string {
  const match = STATUSES.find((s) => s.id === raw);
  return match ? match.id : "paid";
}

/**
 * The payment picker's <select> submits one of two shapes (see MemberOption
 * in components/payments/types.ts): `member:<id>` for a member with no
 * course enrollment yet, or a bare enrollment id for "this member, this
 * specific course" — a member enrolled in 2+ courses shows up once per
 * course there, so a payment always says exactly which one it's for.
 * Verifies the target actually belongs to this partner, the same
 * belt-and-suspenders check the old single-course version did.
 */
async function resolvePaymentTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partnerId: string,
  target: string
): Promise<{ memberId: string; enrollmentId: string | null; productId: string | null } | null> {
  if (target.startsWith("member:")) {
    const memberId = target.slice("member:".length);
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!member) return null;
    return { memberId: member.id, enrollmentId: null, productId: null };
  }

  const { data: enrollment } = await supabase
    .from("member_enrollments")
    .select("id, member_id, product_id")
    .eq("id", target)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!enrollment) return null;
  return { memberId: enrollment.member_id, enrollmentId: enrollment.id, productId: enrollment.product_id };
}

/**
 * "Если добавляется оплата вручную — тогда создается новый лид, если нет
 * существующего. Это тоже связанные процессы по лид id" (Anastasiia, 11
 * сен 2026) — a payment should always trace back to a lead/contact thread,
 * same as a lead-converted member already does via members.lead_id. A
 * member created directly (the "Добавить участницу" button, never through
 * a lead) has none yet; the first time a payment is recorded for her, one
 * is backfilled from her own contact details and linked both ways. Returns
 * the (existing or newly created) lead id, or null if the member itself
 * couldn't be found.
 */
async function ensureLeadForMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partnerId: string,
  memberId: string,
  productId: string | null,
  amount: number
): Promise<string | null> {
  const { data: member } = await supabase
    .from("members")
    .select("id, lead_id, contact_id, name, phone, email, city, birthday")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return null;
  if (member.lead_id) return member.lead_id;

  // Same Контакт as the member's own card — create one if she somehow
  // doesn't have one yet (a member added before this round's migration).
  let contactId = member.contact_id;
  if (!contactId) {
    contactId = await findOrCreateContact(supabase, partnerId, {
      name: member.name,
      phone: member.phone,
      email: member.email,
      city: member.city,
      birthday: member.birthday,
    });
  }

  const { data: newLead, error } = await supabase
    .from("leads")
    .insert({
      partner_id: partnerId,
      contact_id: contactId,
      name: member.name,
      phone: member.phone,
      email: member.email,
      city: member.city,
      birthday: member.birthday,
      product_id: productId,
      stage: "paid",
      value: amount,
      added_date: todayIso(),
    })
    .select("id")
    .single();
  if (error || !newLead) return null;

  await supabase
    .from("members")
    .update({ lead_id: newLead.id, contact_id: contactId })
    .eq("id", memberId);
  return newLead.id;
}

/**
 * Records a payment against an existing member (and, usually, a specific
 * course of theirs). This is a manual ledger entry — "this payment happened
 * / is expected" — not a card-processing integration, so there's no
 * real-time status beyond what the partner enters by hand.
 */
export async function createPayment(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddPayments" };
  }

  const target = String(formData.get("target") || "").trim();
  if (!target) return { error: "errSelectMember" };

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "errEnterAmount" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();

  const supabase = await createClient();
  const resolved = await resolvePaymentTarget(supabase, profile.partner_id, target);
  if (!resolved) return { error: "errMemberNotFound" };

  const leadId = await ensureLeadForMember(supabase, profile.partner_id, resolved.memberId, resolved.productId, amount);

  const { error } = await supabase.from("payments").insert({
    partner_id: profile.partner_id,
    member_id: resolved.memberId,
    enrollment_id: resolved.enrollmentId,
    product_id: resolved.productId,
    lead_id: leadId,
    amount,
    status,
    paid_date: paidDate,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath("/leads");
  revalidatePath("/contacts");
  return { error: null };
}

export async function updatePayment(paymentId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubEdit" };
  }

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "errEnterAmount" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();

  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({ amount, status, paid_date: paidDate })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}

/**
 * Real online payment via Stripe Checkout — currently wired to a single
 * club (STRIPE_ENABLED_PARTNER_ID) that actually has a Stripe account,
 * so other partners can't accidentally send a client's money into it.
 * Creates a "pending" payment row up front and a Checkout Session linked
 * to it by id; the Stripe webhook (see /api/stripe/webhook) flips it to
 * "paid" once the client actually pays. Bulgaria uses the euro since
 * 1 January 2026, so this doesn't need currency conversion for now.
 */
export async function createPaymentLink(formData: FormData): Promise<PaymentLinkResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubCreateLinks" };
  }

  const enabledPartnerId = process.env.STRIPE_ENABLED_PARTNER_ID;
  if (!enabledPartnerId) {
    return { error: "errStripeNotConfigured" };
  }
  if (profile.partner_id !== enabledPartnerId) {
    return { error: "errStripeOnlyOneClub" };
  }

  const target = String(formData.get("target") || "").trim();
  if (!target) return { error: "errSelectMember" };

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "errEnterAmount" };

  let stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return { error: "errStripeSecretMissing" };
  }

  const supabase = await createClient();
  const resolved = await resolvePaymentTarget(supabase, profile.partner_id, target);
  if (!resolved) return { error: "errMemberNotFound" };

  const [{ data: member }, { data: product }] = await Promise.all([
    supabase.from("members").select("name").eq("id", resolved.memberId).maybeSingle(),
    resolved.productId
      ? supabase.from("products").select("name").eq("id", resolved.productId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!member) return { error: "errMemberNotFound" };
  const productName = product?.name ?? null;

  const leadId = await ensureLeadForMember(supabase, profile.partner_id, resolved.memberId, resolved.productId, amount);

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      partner_id: profile.partner_id,
      member_id: resolved.memberId,
      lead_id: leadId,
      enrollment_id: resolved.enrollmentId,
      product_id: resolved.productId,
      amount,
      status: "pending",
      paid_date: todayIso(),
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  const host = (await headers()).get("host");
  const baseUrl = host?.includes("localhost") ? `http://${host}` : `https://${host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: [member.name, productName].filter(Boolean).join(" — ") || "Оплата WiClub",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/payments?paid=1`,
      cancel_url: `${baseUrl}/payments?cancelled=1`,
      metadata: { payment_id: payment.id },
    });

    await supabase
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", payment.id);

    if (!session.url) return { error: "errStripeNoUrl" };

    revalidatePath("/payments");
    return { error: null, url: session.url };
  } catch (err) {
    // Don't leave a dangling "pending" payment with no way to pay it.
    await supabase.from("payments").delete().eq("id", payment.id);
    return { error: err instanceof Error ? err.message : "errCreateLinkFailed" };
  }
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}
