"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { STATUSES, todayIso } from "@/lib/payments";

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

  const { error } = await supabase.from("payments").insert({
    partner_id: profile.partner_id,
    member_id: resolved.memberId,
    enrollment_id: resolved.enrollmentId,
    product_id: resolved.productId,
    amount,
    status,
    paid_date: paidDate,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
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

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      partner_id: profile.partner_id,
      member_id: resolved.memberId,
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
