import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/payments";

// Needs the Node runtime (the Stripe SDK and raw-body signature check
// don't work on the Edge runtime).
export const runtime = "nodejs";

/**
 * Stripe calls this once a Checkout Session finishes. We only trust events
 * whose signature we can verify with STRIPE_WEBHOOK_SECRET — that secret,
 * plus STRIPE_SECRET_KEY, must be set directly in Vercel, never sent here
 * in chat. Uses the service_role admin client because there's no signed-in
 * user on an incoming webhook request — RLS would otherwise block it.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.payment_id;

    if (paymentId) {
      const admin = createAdminClient();
      await admin
        .from("payments")
        .update({ status: "paid", paid_date: todayIso() })
        .eq("id", paymentId)
        .eq("stripe_checkout_session_id", session.id);
    }
  }

  return NextResponse.json({ received: true });
}
