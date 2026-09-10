"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { chunk, getFromAddress, getResendClient, RESEND_BATCH_SIZE } from "@/lib/resend";
import { isAudience, textToSimpleHtml, type CampaignAudience } from "@/lib/email";

export type ActionResult = { error: string | null; campaignId?: string };

type AudienceRecipient = { entityType: "lead" | "member"; entityId: string; email: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Snapshots who the campaign goes to *right now* — resolved once at send
 * time into email_campaign_recipients, so the audience a campaign actually
 * reached is a permanent record, not a live query that could change later.
 * Rows with no email on file are counted but excluded rather than silently
 * dropped, so the compose screen can tell the sender honestly how many of
 * "все участницы" it could actually reach.
 */
async function resolveAudience(
  supabase: SupabaseServerClient,
  partnerId: string,
  audience: CampaignAudience
): Promise<{ recipients: AudienceRecipient[]; skippedNoEmail: number }> {
  if (audience === "members") {
    const { data } = await supabase.from("members").select("id, email").eq("partner_id", partnerId);
    const rows = data ?? [];
    return {
      recipients: rows
        .filter((m): m is { id: string; email: string } => !!m.email)
        .map((m) => ({ entityType: "member" as const, entityId: m.id, email: m.email })),
      skippedNoEmail: rows.filter((m) => !m.email).length,
    };
  }

  const { data } = await supabase.from("leads").select("id, email, stage").eq("partner_id", partnerId);
  const allRows = data ?? [];
  const rows = audience === "leads_active" ? allRows.filter((l) => l.stage !== "paid" && l.stage !== "declined") : allRows;
  return {
    recipients: rows
      .filter((l): l is { id: string; email: string; stage: string } => !!l.email)
      .map((l) => ({ entityType: "lead" as const, entityId: l.id, email: l.email })),
    skippedNoEmail: rows.filter((l) => !l.email).length,
  };
}

/**
 * The actual send, shared by a broadcast campaign and a one-off "write to
 * this one card" email alike: create the campaign row, snapshot the
 * recipients, send via Resend's batch API, record what happened per
 * recipient. `audience` is whatever email_campaigns.audience should say —
 * "members" / "leads_active" / "leads_all" for a broadcast, "single" for a
 * one-off (see sendDirectEmail below).
 */
async function createSendAndTrackCampaign(
  supabase: SupabaseServerClient,
  params: {
    partnerId: string;
    createdBy: string;
    subject: string;
    bodyText: string;
    audience: string;
    recipients: AudienceRecipient[];
    /** The club's real, monitored mailbox for customer replies — see
     * partners.reply_to_email. Null/undefined leaves Resend's default (no
     * reply-to header), so replies would land on the shared From address,
     * which isn't a real inbox anyone reads. */
    replyTo?: string | null;
  }
): Promise<ActionResult> {
  const { partnerId, createdBy, subject, bodyText, audience, recipients, replyTo } = params;
  if (recipients.length === 0) return { error: "errNoRecipientsWithEmail" };

  const { data: campaign, error: campaignError } = await supabase
    .from("email_campaigns")
    .insert({
      partner_id: partnerId,
      subject,
      body: bodyText,
      audience,
      status: "sending",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) return { error: campaignError?.message ?? "errGeneric" };

  const { data: recipientRows, error: recipientsError } = await supabase
    .from("email_campaign_recipients")
    .insert(
      recipients.map((r) => ({
        campaign_id: campaign.id,
        partner_id: partnerId,
        entity_type: r.entityType,
        entity_id: r.entityId,
        email: r.email,
        status: "queued",
      }))
    )
    .select("id, email");
  if (recipientsError || !recipientRows) return { error: recipientsError?.message ?? "errGeneric" };

  let resend;
  try {
    resend = getResendClient();
  } catch {
    await supabase.from("email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
    await supabase
      .from("email_campaign_recipients")
      .update({ status: "failed", error: "RESEND_API_KEY is not configured" })
      .eq("campaign_id", campaign.id);
    return { error: "errResendNotConfigured", campaignId: campaign.id };
  }

  const html = textToSimpleHtml(bodyText);
  const from = getFromAddress();
  let anySent = false;

  for (const batch of chunk(recipientRows, RESEND_BATCH_SIZE)) {
    const { data, error } = await resend.batch.send(
      batch.map((r) => ({
        from,
        to: [r.email],
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      }))
    );

    if (error || !data) {
      await supabase
        .from("email_campaign_recipients")
        .update({ status: "failed", error: error?.message ?? "send failed" })
        .in(
          "id",
          batch.map((r) => r.id)
        );
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const result = data.data?.[i];
      if (result?.id) {
        anySent = true;
        await supabase
          .from("email_campaign_recipients")
          .update({ status: "sent", resend_message_id: result.id })
          .eq("id", batch[i].id);
      } else {
        await supabase
          .from("email_campaign_recipients")
          .update({ status: "failed", error: "no message id returned" })
          .eq("id", batch[i].id);
      }
    }
  }

  await supabase
    .from("email_campaigns")
    .update({ status: anySent ? "sent" : "failed", sent_at: new Date().toISOString() })
    .eq("id", campaign.id);

  if (!anySent) return { error: "errSendFailed", campaignId: campaign.id };
  return { error: null, campaignId: campaign.id };
}

/** Same shape everywhere else in the app: read-only preview, no side
 * effects — used by the compose screen to show a real recipient count
 * (and how many are being skipped for missing email) before sending. */
export async function previewAudience(
  audience: CampaignAudience
): Promise<{ count: number; skippedNoEmail: number } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };
  if (!isAudience(audience)) return { error: "errChooseAudience" };

  const supabase = await createClient();
  const { recipients, skippedNoEmail } = await resolveAudience(supabase, profile.partner_id, audience);
  return { count: recipients.length, skippedNoEmail };
}

export async function createAndSendCampaign(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const subject = String(formData.get("subject") || "").trim();
  const bodyText = String(formData.get("body") || "").trim();
  const audienceRaw = String(formData.get("audience") || "");
  if (!subject) return { error: "errEnterSubject" };
  if (!bodyText) return { error: "errEnterBody" };
  if (!isAudience(audienceRaw)) return { error: "errChooseAudience" };

  const supabase = await createClient();
  const { recipients } = await resolveAudience(supabase, profile.partner_id, audienceRaw);

  const result = await createSendAndTrackCampaign(supabase, {
    partnerId: profile.partner_id,
    createdBy: profile.id,
    subject,
    bodyText,
    audience: audienceRaw,
    recipients,
    replyTo: profile.partner_reply_to_email,
  });

  revalidatePath("/email");
  return result;
}

/**
 * One-off email to a single lead or member, sent straight from their own
 * card — the gap Anastasia flagged after comparing to the prototype. Goes
 * through the exact same Resend pipeline as a broadcast campaign (real
 * delivery, real opened/clicked tracking via the webhook) and shows up in
 * the Email list as a one-recipient "Лично" campaign, rather than being a
 * separate, untracked code path.
 */
export async function sendDirectEmail(
  entityType: "lead" | "member",
  entityId: string,
  subject: string,
  bodyText: string
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmedSubject = subject.trim();
  const trimmedBody = bodyText.trim();
  if (!trimmedSubject) return { error: "errEnterSubject" };
  if (!trimmedBody) return { error: "errEnterBody" };

  const supabase = await createClient();
  const table = entityType === "lead" ? "leads" : "members";
  // .eq("partner_id", ...) is belt-and-suspenders on top of RLS — makes the
  // "this card isn't yours" case an honest error here rather than relying
  // solely on the database silently returning nothing.
  const { data: entity } = await supabase
    .from(table)
    .select("id, email")
    .eq("id", entityId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!entity) return { error: "errNotAuthorized" };
  if (!entity.email) return { error: "errRecipientHasNoEmail" };

  const result = await createSendAndTrackCampaign(supabase, {
    partnerId: profile.partner_id,
    createdBy: profile.id,
    subject: trimmedSubject,
    bodyText: trimmedBody,
    audience: "single",
    recipients: [{ entityType, entityId: entity.id, email: entity.email }],
    replyTo: profile.partner_reply_to_email,
  });

  revalidatePath("/email");
  return result;
}
