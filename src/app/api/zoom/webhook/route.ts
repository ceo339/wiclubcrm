import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSystemComment,
  hmacHex,
  isTerminalStage,
  logIntegrationEvent,
  safeEqual,
  setStage,
  stageIndex,
} from "@/lib/integrations/franchise";

export const runtime = "nodejs";

/**
 * Round 41 — Zoom cloud recording → «Ссылка на запись Zoom» on the candidate.
 *
 * Zoom (Marketplace app with Event Subscription «All Recordings have
 * completed» = recording.completed) posts here. Security per Zoom docs:
 *  - endpoint.url_validation: reply { plainToken, encryptedToken } where
 *    encryptedToken = HMAC-SHA256(secret token, plainToken) hex;
 *  - every event: header x-zm-signature = "v0=" + HMAC-SHA256(secret token,
 *    `v0:${x-zm-request-timestamp}:${rawBody}`) hex.
 * The secret token lives only in Vercel as ZOOM_WEBHOOK_SECRET_TOKEN.
 *
 * Matching: the Calendly webhook stored the booking's Zoom meeting id on the
 * candidate (zoom_meeting_id); the recording's `object.id` is that same
 * meeting id. No match → logged in integration_events, nothing else touched
 * (other Zoom meetings on the account are simply ignored).
 */

const TOLERANCE_SEC = 5 * 60;

type ZoomEvent = {
  event?: string;
  payload?: {
    plainToken?: string;
    object?: {
      id?: number | string;
      topic?: string;
      start_time?: string;
      share_url?: string;
      password?: string;
      recording_play_passcode?: string;
    };
  };
};

function withPasscode(shareUrl: string, playPasscode?: string): string {
  if (!playPasscode) return shareUrl;
  try {
    const u = new URL(shareUrl);
    if (!u.searchParams.has("pwd")) u.searchParams.set("pwd", playPasscode);
    return u.toString();
  } catch {
    return shareUrl;
  }
}

export async function POST(request: Request) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim();
  if (!secret) return NextResponse.json({ error: "ZOOM_WEBHOOK_SECRET_TOKEN is not configured" }, { status: 500 });

  const rawBody = await request.text();
  const ts = request.headers.get("x-zm-request-timestamp") ?? "";
  const sig = request.headers.get("x-zm-signature") ?? "";
  const expected = "v0=" + hmacHex(secret, `v0:${ts}:${rawBody}`);
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SEC || !safeEqual(sig, expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let evt: ZoomEvent;
  try {
    evt = JSON.parse(rawBody) as ZoomEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (evt.event === "endpoint.url_validation") {
    const plainToken = evt.payload?.plainToken ?? "";
    return NextResponse.json({ plainToken, encryptedToken: hmacHex(secret, plainToken) });
  }

  const admin = createAdminClient();
  const type = evt.event ?? "unknown";
  if (type !== "recording.completed") {
    await logIntegrationEvent(admin, { source: "zoom", event_type: type, status: "ignored" });
    return NextResponse.json({ ok: true, ignored: type });
  }

  const obj = evt.payload?.object ?? {};
  const meetingId = obj.id != null ? String(obj.id) : null;
  if (!meetingId || !obj.share_url) {
    await logIntegrationEvent(admin, { source: "zoom", event_type: type, status: "no_share_url", detail: meetingId ?? undefined });
    return NextResponse.json({ ok: true, matched: false });
  }

  const { data } = await admin
    .from("franchise_candidates")
    .select("id, zoom_recording_url, stage")
    .eq("zoom_meeting_id", meetingId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const candidate = data?.[0];
  if (!candidate) {
    await logIntegrationEvent(admin, { source: "zoom", event_type: type, status: "no_match", detail: `${meetingId} ${obj.topic ?? ""}`.trim() });
    return NextResponse.json({ ok: true, matched: false });
  }

  const url = withPasscode(obj.share_url, obj.recording_play_passcode);
  if (!candidate.zoom_recording_url) {
    await admin.from("franchise_candidates").update({ zoom_recording_url: url }).eq("id", candidate.id);
  }
  const lines = [
    candidate.zoom_recording_url ? "Ещё одна запись Zoom по этой встрече:" : "Запись интервью в Zoom готова:",
    url,
  ];
  if (obj.password) lines.push(`Код доступа: ${obj.password}`);
  await addSystemComment(admin, candidate.id, lines.join("\n"));

  // "как только запись появляется — переводить на «Собеседование пройдено»"
  // (Anastasiia, 29 сен 2026). A finished recording of the interview meeting
  // means the interview happened. Only moves FORWARD from an earlier stage;
  // a candidate already further along, or declined/paused, is left as is.
  if (!isTerminalStage(candidate.stage) && stageIndex(candidate.stage) < stageIndex("interview_done")) {
    await setStage(admin, candidate.id, "interview_done", "Zoom: запись интервью готова");
  }
  await logIntegrationEvent(admin, { source: "zoom", event_type: type, status: "matched", candidate_id: candidate.id });
  return NextResponse.json({ ok: true, id: candidate.id });
}
