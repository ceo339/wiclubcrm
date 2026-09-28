import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { FRANCHISE_STAGES, type FranchiseStageId } from "@/lib/franchise";
import type { Json } from "@/types/database";

/**
 * Shared server-only helpers for round 41's franchise integrations:
 * Google-form intake (/api/franchise/intake), Calendly (/api/calendly/webhook)
 * and Zoom (/api/zoom/webhook). Every one of them is an incoming webhook with
 * no signed-in user, so all writes go through the service_role admin client —
 * same trust model as the Stripe/Resend/DSK webhooks. Each route verifies its
 * own signature/secret BEFORE calling anything here.
 */

export type Admin = ReturnType<typeof createAdminClient>;

/** Author name shown on automatic comments in the candidate card. */
export const SYSTEM_AUTHOR = "Автоматически";

export function stageIndex(stage: string): number {
  return FRANCHISE_STAGES.findIndex((s) => s.id === stage);
}

export function isTerminalStage(stage: string): boolean {
  return FRANCHISE_STAGES.find((s) => s.id === stage)?.lost === true;
}

/** Constant-time compare of two hex/ascii strings (false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/** Numeric Zoom meeting id out of a join URL like https://us06web.zoom.us/j/81234567890?pwd=… */
export function zoomMeetingIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/(?:j|w|s|wc\/join)\/(\d{9,12})/);
  return m ? m[1] : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

/** Most recent candidate with this email (case-insensitive), or null. */
export async function findCandidateByEmail(admin: Admin, email: string | null) {
  if (!email) return null;
  const { data } = await admin
    .from("franchise_candidates")
    .select("*")
    .ilike("email", email)
    .order("submitted_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/** Moves the candidate and logs the transition to franchise_stage_history. */
export async function setStage(
  admin: Admin,
  candidateId: string,
  stage: FranchiseStageId,
  note: string,
  extra: Record<string, unknown> = {}
) {
  await admin
    .from("franchise_candidates")
    .update({ stage, ...extra })
    .eq("id", candidateId);
  await admin.from("franchise_stage_history").insert({ candidate_id: candidateId, stage, note });
}

export async function addSystemComment(admin: Admin, candidateId: string, body: string) {
  await admin.from("franchise_candidate_comments").insert({
    candidate_id: candidateId,
    author_id: null,
    author_name: SYSTEM_AUTHOR,
    body,
  });
}

/** Debug trail for every incoming webhook — service_role-only table. */
export async function logIntegrationEvent(
  admin: Admin,
  e: { source: string; event_type: string; status: string; candidate_id?: string | null; detail?: string; payload?: unknown }
) {
  try {
    await admin.from("integration_events").insert({
      source: e.source,
      event_type: e.event_type,
      status: e.status,
      candidate_id: e.candidate_id ?? null,
      detail: e.detail ?? null,
      payload: (e.payload ?? null) as Json,
    });
  } catch {
    // Logging must never break the webhook itself.
  }
}

/** "30.09.2026, 14:00 (Мадрид)" — interview time as the team reads it. */
export function formatMadrid(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Madrid",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)) + " (Мадрид)"
    );
  } catch {
    return iso;
  }
}
