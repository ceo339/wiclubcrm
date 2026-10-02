import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dskAmountEur, dskOutcome, verifyDskChecksum } from "@/lib/dsk";
import { logIntegrationEvent } from "@/lib/integrations/franchise";
import { todayIso } from "@/lib/payments";

// Node runtime, not Edge, so the crypto HMAC check behaves consistently.
export const runtime = "nodejs";

/**
 * DSK Bank (ВПОС, София) calls this when an online payment's status changes —
 * a plain GET with the payload in the query string, signed with
 * HMAC-SHA256 (see lib/dsk). DSK_CALLBACK_SECRET is set in Vercel only.
 *
 * Round 55 (Oct 2026) — no callback had ever been seen, so:
 *   • EVERY request is logged to integration_events (source "dsk"),
 *     including a bad checksum or a missing secret — so we can tell
 *     «банк вообще не звонит» from «звонит, а мы отбрасываем».
 *     Payload = all query params except `checksum` (no secrets in it).
 *   • Matching: orderNumber = our payments.id (links made from the CRM, once
 *     register.do exists) → else dsk_order_id = mdOrder (repeat callback).
 *   • Paid and nothing matched (a link made by hand in vpos.dskbank.bg,
 *     orderNumber like 37000) → a new «Оплаты» row for WiClub Sofia, without
 *     a member; the club then links it to the participant and поток.
 *     Created only when the callback carries the amount.
 *   • Declined → logged with the bank's reason, no payment row.
 *   • Refunded / reversed → a matched payment becomes «Возврат».
 * Always answers 200 for a verified callback so the bank doesn't retry
 * forever; 400 only for a bad checksum.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const payload: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) if (k !== "checksum") payload[k] = v;
  const operation = searchParams.get("operation") ?? "?";

  const secret = process.env.DSK_CALLBACK_SECRET;
  if (!secret) {
    await logIntegrationEvent(admin, { source: "dsk", event_type: operation, status: "no_secret", payload });
    return NextResponse.json({ error: "DSK_CALLBACK_SECRET is not configured" }, { status: 500 });
  }
  if (!verifyDskChecksum(searchParams, secret)) {
    await logIntegrationEvent(admin, {
      source: "dsk",
      event_type: operation,
      status: "bad_checksum",
      detail: searchParams.get("checksum") ? "checksum mismatch" : "no checksum",
      payload,
    });
    return NextResponse.json({ error: "Invalid checksum" }, { status: 400 });
  }

  const orderNumber = searchParams.get("orderNumber");
  const mdOrder = searchParams.get("mdOrder");
  const outcome = dskOutcome(searchParams);
  const amount = dskAmountEur(searchParams);

  // Find the CRM payment this callback is about.
  let paymentId: string | null = null;
  if (orderNumber && UUID_RE.test(orderNumber)) {
    const { data } = await admin.from("payments").select("id").eq("id", orderNumber).maybeSingle();
    paymentId = data?.id ?? null;
  }
  if (!paymentId && mdOrder) {
    const { data } = await admin.from("payments").select("id").eq("dsk_order_id", mdOrder).limit(1).maybeSingle();
    paymentId = data?.id ?? null;
  }

  let status: string = outcome;
  let detail = `orderNumber=${orderNumber ?? "—"} mdOrder=${mdOrder ?? "—"}${amount != null ? ` amount=${amount}` : ""}`;

  if (outcome === "paid") {
    if (paymentId) {
      await admin
        .from("payments")
        .update({ status: "paid", paid_date: todayIso(), ...(mdOrder ? { dsk_order_id: mdOrder } : {}) })
        .eq("id", paymentId);
      status = "paid_matched";
    } else if (amount != null && amount > 0) {
      const partnerId = await dskPartnerId(admin);
      if (partnerId) {
        const { data } = await admin
          .from("payments")
          .insert({
            partner_id: partnerId,
            amount,
            status: "paid",
            paid_date: todayIso(),
            dsk_order_id: mdOrder ?? (orderNumber ? `order:${orderNumber}` : null),
          })
          .select("id")
          .single();
        paymentId = data?.id ?? null;
        status = paymentId ? "paid_created" : "paid_insert_failed";
      } else {
        status = "paid_no_club";
      }
    } else {
      status = "paid_no_amount";
    }
  } else if (outcome === "refunded" && paymentId) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", paymentId);
    status = "refunded_matched";
  } else if (outcome === "declined") {
    const reason = searchParams.get("actionCodeDescription") || searchParams.get("errorMessage") || searchParams.get("actionCode");
    if (reason) detail += ` reason=${reason}`;
  }

  await logIntegrationEvent(admin, {
    source: "dsk",
    event_type: operation,
    status,
    detail: paymentId ? `${detail} payment=${paymentId}` : detail,
    payload,
  });

  return new NextResponse("OK", { status: 200 });
}

/** The club whose DSK terminal this is: DSK_PARTNER_ID, else «WiClub Sofia». */
async function dskPartnerId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  if (process.env.DSK_PARTNER_ID) return process.env.DSK_PARTNER_ID;
  const { data } = await admin.from("partners").select("id").ilike("name", "%sofia%").limit(1).maybeSingle();
  return data?.id ?? null;
}
