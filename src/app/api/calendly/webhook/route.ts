import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSystemComment,
  findCandidateByEmail,
  formatMadrid,
  hmacHex,
  isTerminalStage,
  logIntegrationEvent,
  normalizeEmail,
  safeEqual,
  setStage,
  stageIndex,
  zoomMeetingIdFromUrl,
} from "@/lib/integrations/franchise";

export const runtime = "nodejs";

/**
 * Round 41 — Calendly → «Интервью назначено».
 *
 * Calendly (Standard plan+) calls this on invitee.created / invitee.canceled.
 * Signature: header `Calendly-Webhook-Signature: t=<unix>,v1=<hex>` where
 * v1 = HMAC-SHA256(signing key, `${t}.${rawBody}`). The signing key is the
 * one given when the webhook subscription is created — stored only in Vercel
 * as CALENDLY_WEBHOOK_SIGNING_KEY.
 *
 * Optional CALENDLY_EVENT_NAME (comma-separated, case-insensitive substrings)
 * limits this to the franchise-interview event type, so other meetings in the
 * same Calendly account never touch the franchise pipeline.
 *
 * Behaviour (confirmed with Anastasiia, 28 сен 2026):
 *  - booked → candidate (matched by email; created if not found) moves to
 *    «Интервью назначено» with the Calendly date in interview_scheduled_at.
 *    A candidate already FURTHER along isn't moved back — only the date/
 *    comment is updated. A declined/paused candidate who books again is
 *    brought back to «Интервью назначено».
 *  - rescheduled → Calendly sends canceled(rescheduled=true) + a new created:
 *    the cancel is ignored, the new booking just updates the date.
 *  - canceled (for real) → back to «В работе», date cleared, reason in a
 *    comment and in the stage history note.
 *  - The Zoom meeting id from the booking's join_url is saved, so the Zoom
 *    webhook can later attach the recording to this exact candidate.
 */

const TOLERANCE_SEC = 5 * 60;

type QA = { question?: string; answer?: string };
type CalendlyPayload = {
  email?: string;
  name?: string;
  uri?: string;
  rescheduled?: boolean;
  text_reminder_number?: string | null;
  questions_and_answers?: QA[];
  cancellation?: { reason?: string | null; canceled_by?: string | null } | null;
  scheduled_event?: {
    uri?: string;
    name?: string;
    start_time?: string;
    location?: { type?: string; join_url?: string | null; location?: string | null } | null;
  };
};
type CalendlyEvent = { event?: string; payload?: CalendlyPayload };

function verify(header: string | null, rawBody: string, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SEC) return false;
  return safeEqual(hmacHex(key, `${t}.${rawBody}`), v1);
}

function eventNameAllowed(name: string | undefined): boolean {
  const filter = process.env.CALENDLY_EVENT_NAME?.trim();
  if (!filter) return true;
  const n = (name ?? "").toLowerCase();
  return filter
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((s) => n.includes(s));
}

export async function POST(request: Request) {
  // .trim(): a value pasted into Vercel with a stray space/newline would
  // otherwise silently fail every signature check.
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();
  if (!key) return NextResponse.json({ error: "CALENDLY_WEBHOOK_SIGNING_KEY is not configured" }, { status: 500 });

  const rawBody = await request.text();
  const sigHeader = request.headers.get("calendly-webhook-signature");
  if (!verify(sigHeader, rawBody, key)) {
    // Log rejected deliveries (without the body) so a key mismatch is
    // visible in integration_events instead of silently disappearing.
    // key_fp = first 8 hex of sha256(key) — identifies WHICH key is set
    // without revealing it.
    if (sigHeader) {
      const t = Number(/t=(\d+)/.exec(sigHeader)?.[1] ?? 0);
      await logIntegrationEvent(createAdminClient(), {
        source: "calendly",
        event_type: "signature_check",
        status: "bad_signature",
        detail: `key_fp=${createHash("sha256").update(key).digest("hex").slice(0, 8)} age_sec=${Math.round(Date.now() / 1000 - t)}`,
      });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let evt: CalendlyEvent;
  try {
    evt = JSON.parse(rawBody) as CalendlyEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const type = evt.event ?? "unknown";
  const p = evt.payload ?? {};
  const admin = createAdminClient();

  if (!eventNameAllowed(p.scheduled_event?.name)) {
    await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "ignored_event_type", detail: p.scheduled_event?.name });
    return NextResponse.json({ ok: true, ignored: "event type" });
  }

  const email = normalizeEmail(p.email);

  if (type === "invitee.created") {
    const startTime = p.scheduled_event?.start_time ?? null;
    const joinUrl = p.scheduled_event?.location?.join_url ?? null;
    const fields = {
      interview_scheduled_at: startTime,
      calendly_invitee_uri: p.uri ?? null,
      calendly_event_uri: p.scheduled_event?.uri ?? null,
      zoom_meeting_id: zoomMeetingIdFromUrl(joinUrl),
    };
    const when = startTime ? formatMadrid(startTime) : "—";

    let candidate = await findCandidateByEmail(admin, email);
    let createdNow = false;
    if (!candidate) {
      const { data, error } = await admin
        .from("franchise_candidates")
        .insert({
          name: p.name?.trim() || email || "Без имени",
          email,
          phone: p.text_reminder_number || null,
          source: "Calendly",
          stage: "application",
        })
        .select("*")
        .single();
      if (error || !data) {
        await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "error", detail: error?.message, payload: evt });
        return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
      }
      candidate = data;
      createdNow = true;
      await admin.from("franchise_stage_history").insert({ candidate_id: data.id, stage: "application", note: "Создана из записи в Calendly (анкета в CRM не найдена)" });
    }

    const current = candidate.stage;
    const target = stageIndex("interview_scheduled");
    const note = `Calendly: интервью на ${when}`;
    if (isTerminalStage(current) || stageIndex(current) < target) {
      await setStage(admin, candidate.id, "interview_scheduled", note, { ...fields, reject_reason: null });
    } else {
      await admin.from("franchise_candidates").update(fields).eq("id", candidate.id);
    }

    const lines = [
      current === "interview_scheduled" && !createdNow
        ? `Интервью перенесено в Calendly — новое время: ${when}.`
        : `Записалась на интервью через Calendly: ${when}.`,
    ];
    if (joinUrl) lines.push(`Ссылка на Zoom: ${joinUrl}`);
    for (const qa of p.questions_and_answers ?? []) {
      if (qa.question && qa.answer) lines.push(`${qa.question}: ${qa.answer}`);
    }
    await addSystemComment(admin, candidate.id, lines.join("\n"));
    await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: createdNow ? "created" : "matched", candidate_id: candidate.id });
    return NextResponse.json({ ok: true, id: candidate.id });
  }

  if (type === "invitee.canceled") {
    if (p.rescheduled) {
      await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "ignored_reschedule" });
      return NextResponse.json({ ok: true, ignored: "rescheduled" });
    }

    let candidate = null;
    if (p.uri) {
      const { data } = await admin.from("franchise_candidates").select("*").eq("calendly_invitee_uri", p.uri).limit(1);
      candidate = data?.[0] ?? null;
    }
    candidate ??= await findCandidateByEmail(admin, email);
    if (!candidate) {
      await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "no_match", detail: email ?? undefined });
      return NextResponse.json({ ok: true, matched: false });
    }

    const reason = p.cancellation?.reason?.trim();
    const note = `Интервью отменено в Calendly${reason ? `: ${reason}` : ""}`;
    const cleared = { interview_scheduled_at: null, calendly_invitee_uri: null, calendly_event_uri: null, zoom_meeting_id: null };
    if (candidate.stage === "interview_scheduled") {
      await setStage(admin, candidate.id, "in_progress", note, cleared);
    }
    await addSystemComment(admin, candidate.id, note + ".");
    await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "matched", candidate_id: candidate.id });
    return NextResponse.json({ ok: true, id: candidate.id });
  }

  await logIntegrationEvent(admin, { source: "calendly", event_type: type, status: "ignored" });
  return NextResponse.json({ ok: true, ignored: type });
}
