import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { isForwardStatusMove, type RecipientStatus } from "@/lib/email";

// Needs the Node runtime, same reason as the Stripe webhook — raw-body
// signature verification doesn't work on the Edge runtime.
export const runtime = "nodejs";

type ResendEvent = {
  type: string;
  data: { email_id?: string; [key: string]: unknown };
};

const EVENT_STATUS: Record<string, RecipientStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

/**
 * Resend calls this for every delivery event (sent/delivered/opened/
 * clicked/bounced/complained/failed) on any campaign email. Verified with
 * RESEND_WEBHOOK_SECRET via svix (Resend's webhook signing provider) — that
 * secret must be set directly in Vercel, same rule as every other secret in
 * this app, never pasted into chat. Uses the service_role admin client
 * because there's no signed-in user on an incoming webhook request; this is
 * also *why* email_campaign_recipients' update RLS policy only lets a
 * partner flip queued->sent — everything past that only ever comes from
 * here, bypassing RLS entirely, so a club can never fake its own open/click
 * numbers.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  let event: ResendEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as ResendEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const nextStatus = EVENT_STATUS[event.type];
  const emailId = event.data?.email_id;

  if (nextStatus && emailId) {
    const admin = createAdminClient();
    const { data: recipient } = await admin
      .from("email_campaign_recipients")
      .select("id, status")
      .eq("resend_message_id", emailId)
      .maybeSingle();

    if (recipient && isForwardStatusMove(recipient.status, nextStatus)) {
      const now = new Date().toISOString();
      await admin
        .from("email_campaign_recipients")
        .update({
          status: nextStatus,
          ...(nextStatus === "opened" ? { opened_at: now } : {}),
          ...(nextStatus === "clicked" ? { clicked_at: now } : {}),
        })
        .eq("id", recipient.id);
    }
  }

  return NextResponse.json({ received: true });
}
