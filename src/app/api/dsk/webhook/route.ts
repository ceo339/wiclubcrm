import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dskAmountEur, dskOutcome, verifyDskChecksum } from "@/lib/dsk";
import { clubTimeZone, dateInTimeZone, isTestPayment, paidDateForClub } from "@/lib/dskMatch";
import { logIntegrationEvent } from "@/lib/integrations/franchise";
import { enrollDskPayment } from "@/lib/server/dskEnroll";

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
 *     orderNumber like 37000) → a new «Оплаты» row for WiClub Sofia.
 *     Created only when the callback carries the amount.
 *   • Declined → logged with the bank's reason, no payment row.
 *   • Refunded / reversed → a matched payment becomes «Возврат».
 * Always answers 200 for a verified callback so the bank doesn't retry
 * forever; 400 only for a bad checksum.
 *
 * Round 58 (6 Oct 2026) — «оплата → курс → участница»
 * (claude/wiclub-crm-dsk-autoenroll-spec.md). After the payment row is saved,
 * lib/server/dskEnroll finds the person by payerEmail/payerPhone (or creates
 * contact + lead), recognises the course from orderDescription, moves the lead
 * to «Оплата», creates the participant and enrolment, links the payment and
 * picks the поток. Also here:
 *   • a repeated notification for a payment that is already paid is a no-op
 *     (`paid_duplicate`) — the bank may resend, and nothing may be created twice;
 *   • test payments (amount under 5 EUR, or a description starting with TEST)
 *     create nothing — only the integration_events row (`paid_test_ignored`);
 *   • paid_date is the day in the club's time zone (Europe/Sofia), not the UTC day;
 *   • the enrolment step never loses a payment: it runs after the payment was
 *     saved, and any failure in it is logged (`paid_created_enroll_failed`)
 *     while the payment stays in «Оплаты».
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof createAdminClient>;

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
  let existingStatus: string | null = null;
  if (orderNumber && UUID_RE.test(orderNumber)) {
    const { data } = await admin.from("payments").select("id, status").eq("id", orderNumber).maybeSingle();
    paymentId = data?.id ?? null;
    existingStatus = data?.status ?? null;
  }
  if (!paymentId && mdOrder) {
    const { data } = await admin
      .from("payments")
      .select("id, status")
      .eq("dsk_order_id", mdOrder)
      .limit(1)
      .maybeSingle();
    paymentId = data?.id ?? null;
    existingStatus = data?.status ?? null;
  }

  let status: string = outcome;
  let detail = `orderNumber=${orderNumber ?? "—"} mdOrder=${mdOrder ?? "—"}${amount != null ? ` amount=${amount}` : ""}`;

  if (outcome === "paid") {
    const description = searchParams.get("orderDescription");
    const now = new Date();

    if (paymentId) {
      if (existingStatus === "paid") {
        // The bank repeated a notification we already handled — nothing to do.
        status = "paid_duplicate";
      } else {
        const club = await dskPartner(admin);
        await admin
          .from("payments")
          .update({
            status: "paid",
            paid_date: paidDateForClub(searchParams.get("paymentDate"), now, club?.country),
            ...(mdOrder ? { dsk_order_id: mdOrder } : {}),
          })
          .eq("id", paymentId);
        status = "paid_matched";
      }
    } else if (amount == null) {
      status = "paid_no_amount";
    } else if (isTestPayment(amount, description)) {
      // «Тестовые платежи не создают платёж, участницу и не двигают лид».
      status = "paid_test_ignored";
    } else {
      const club = await dskPartner(admin);
      if (!club) {
        status = "paid_no_club";
      } else {
        const paidDate = paidDateForClub(searchParams.get("paymentDate"), now, club.country);
        const { data } = await admin
          .from("payments")
          .insert({
            partner_id: club.id,
            amount,
            status: "paid",
            paid_date: paidDate,
            dsk_order_id: mdOrder ?? (orderNumber ? `order:${orderNumber}` : null),
          })
          .select("id")
          .single();
        paymentId = data?.id ?? null;
        status = paymentId ? "paid_created" : "paid_insert_failed";

        if (paymentId) {
          // The money is saved. Everything below only links it to a person and a
          // course — if it fails, the payment simply stays «Не привязана».
          try {
            const result = await enrollDskPayment({
              db: admin,
              partnerId: club.id,
              paymentId,
              amount,
              description,
              payerEmail: searchParams.get("payerEmail"),
              payerPhone: searchParams.get("payerPhone"),
              cardholderName: searchParams.get("cardholderName"),
              paidDate,
              today: dateInTimeZone(now, clubTimeZone(club.country)),
            });
            status = result.status;
            detail += ` ${result.detail}`;
          } catch (error) {
            status = "paid_created_enroll_failed";
            detail += ` error=${error instanceof Error ? error.message : String(error)}`;
          }
        }
      }
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
async function dskPartner(admin: Admin): Promise<{ id: string; country: string | null } | null> {
  if (process.env.DSK_PARTNER_ID) {
    const { data } = await admin.from("partners").select("id, country").eq("id", process.env.DSK_PARTNER_ID).maybeSingle();
    return data ?? { id: process.env.DSK_PARTNER_ID, country: null };
  }
  const { data } = await admin.from("partners").select("id, country").ilike("name", "%sofia%").limit(1).maybeSingle();
  return data ?? null;
}
