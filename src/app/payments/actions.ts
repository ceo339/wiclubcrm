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
 * Records a payment against an existing member. This is a manual ledger
 * entry — "this payment happened / is expected" — not a card-processing
 * integration, so there's no real-time status beyond what the partner
 * enters by hand.
 */
export async function createPayment(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — добавлять оплаты может только партнёр." };
  }

  const memberId = String(formData.get("member_id") || "").trim();
  if (!memberId) return { error: "Выберите участницу" };

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Укажите сумму" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();

  const supabase = await createClient();

  // Verify the member belongs to this partner and pull their product, so a
  // payment can't be attached to someone else's participant.
  const { data: member } = await supabase
    .from("members")
    .select("id, product_id")
    .eq("id", memberId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();

  if (!member) return { error: "Участница не найдена" };

  const { error } = await supabase.from("payments").insert({
    partner_id: profile.partner_id,
    member_id: member.id,
    product_id: member.product_id,
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
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — редактировать может только партнёр." };
  }

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Укажите сумму" };

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
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — ссылки на оплату может создавать только партнёр." };
  }

  const enabledPartnerId = process.env.STRIPE_ENABLED_PARTNER_ID;
  if (!enabledPartnerId) {
    return {
      error:
        "Онлайн-оплата ещё не настроена для этого клуба (нет STRIPE_ENABLED_PARTNER_ID в переменных окружения).",
    };
  }
  if (profile.partner_id !== enabledPartnerId) {
    return { error: "Онлайн-оплата пока подключена только для одного клуба сети." };
  }

  const memberId = String(formData.get("member_id") || "").trim();
  if (!memberId) return { error: "Выберите участницу" };

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Укажите сумму" };

  let stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return { error: "Не настроен серверный ключ Stripe (STRIPE_SECRET_KEY)." };
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, name, product_id, products(name)")
    .eq("id", memberId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();

  if (!member) return { error: "Участница не найдена" };
  const productName = (member as { products?: { name: string } | null }).products?.name ?? null;

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      partner_id: profile.partner_id,
      member_id: member.id,
      product_id: member.product_id,
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

    if (!session.url) return { error: "Stripe не вернул ссылку на оплату" };

    revalidatePath("/payments");
    return { error: null, url: session.url };
  } catch (err) {
    // Don't leave a dangling "pending" payment with no way to pay it.
    await supabase.from("payments").delete().eq("id", payment.id);
    return { error: err instanceof Error ? err.message : "Не удалось создать ссылку на оплату" };
  }
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) return { error: "У аккаунта HQ нет своего клуба." };

  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}
