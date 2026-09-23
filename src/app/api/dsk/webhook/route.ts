import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDskCallbackPaid, verifyDskChecksum } from "@/lib/dsk";
import { todayIso } from "@/lib/payments";

// Same reason as the Stripe webhook: the Node runtime, not Edge, so the
// crypto HMAC check behaves consistently.
export const runtime = "nodejs";

/**
 * DSK Bank (ВПОС) calls this once an online payment's status changes —
 * round 34, see the project doc's "Онлайн-оплата (София, DSK Bank)"
 * section for the full history (points 28–31) and the checksum algorithm
 * (point 29). Unlike Stripe's webhook, DSK's notification is a plain GET
 * request with the payload in the query string, not a signed POST body —
 * confirmed in the merchant portal (Callback method = GET, point 31).
 *
 * We only trust a notification whose checksum verifies against
 * DSK_CALLBACK_SECRET — that secret must be set directly in Vercel (the
 * same key generated in the Настройки → Callback notifications section of
 * the merchant portal, vpos.dskbank.bg), never sent here in chat, same
 * rule as STRIPE_WEBHOOK_SECRET/RESEND_WEBHOOK_SECRET.
 *
 * Matches the payment by DSK's own `orderNumber` — the order number we
 * pass to `register.do` when creating the payment link is always our own
 * `payments.id`, exactly like Stripe's `metadata.payment_id` — so no
 * separate lookup table is needed. `mdOrder` (DSK's own order id) is
 * opportunistically backfilled into `payments.dsk_order_id` here too, in
 * case the create-link step didn't already store it.
 *
 * NOTE: the "create payment link" half of this integration
 * (`register.do`, the actual button in Оплаты) isn't written yet — it
 * needs `register.do`'s own merchant authentication, which is a separate
 * credential from this callback checksum key and hasn't been confirmed
 * yet. This route is real and safe to point DSK at today, but nothing
 * will call it for real until that half exists too.
 */
export async function GET(request: Request) {
  const secret = process.env.DSK_CALLBACK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DSK_CALLBACK_SECRET is not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);

  if (!verifyDskChecksum(searchParams, secret)) {
    return NextResponse.json({ error: "Invalid checksum" }, { status: 400 });
  }

  const orderNumber = searchParams.get("orderNumber");
  const mdOrder = searchParams.get("mdOrder");

  if (orderNumber && isDskCallbackPaid(searchParams)) {
    const admin = createAdminClient();
    await admin
      .from("payments")
      .update({
        status: "paid",
        paid_date: todayIso(),
        ...(mdOrder ? { dsk_order_id: mdOrder } : {}),
      })
      .eq("id", orderNumber);
  }

  // DSK expects a plain 200 OK to consider the notification delivered —
  // an empty body is enough, same convention as most callback gateways.
  return new NextResponse("OK", { status: 200 });
}
