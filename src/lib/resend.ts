import { Resend } from "resend";

/**
 * Server-only Resend client. RESEND_API_KEY is a secret and must only ever
 * live in Vercel's environment variables — same rule as STRIPE_SECRET_KEY
 * and SUPABASE_SERVICE_ROLE_KEY (see lib/stripe.ts, lib/supabase/admin.ts):
 * never requested from or pasted into chat.
 */
export function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(key);
}

/**
 * The "From" address every campaign email is sent as. Sending to real
 * recipients requires a domain verified in Resend (its own dashboard step —
 * add the domain, add the DNS records it gives you at your registrar).
 * Until RESEND_FROM_EMAIL is set, this falls back to Resend's shared
 * onboarding address, which only ever delivers to the Resend account's own
 * verified email — fine for a first test send, not for real members/leads.
 */
export function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "WI Club <onboarding@resend.dev>";
}

/** Resend's batch endpoint caps each call at 100 emails. */
export const RESEND_BATCH_SIZE = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
