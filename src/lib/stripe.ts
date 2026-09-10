import Stripe from "stripe";

/**
 * Server-only Stripe client. STRIPE_SECRET_KEY is a secret and must only
 * ever live in Vercel's environment variables, never in the client bundle
 * or in chat — same rule as SUPABASE_SERVICE_ROLE_KEY.
 *
 * v1 scope: one global Stripe account for the whole app, restricted (in
 * the payments actions) to a single partner via STRIPE_ENABLED_PARTNER_ID
 * so other clubs can't accidentally route a payment link into it. If more
 * clubs want online payments later, this needs to become per-partner keys
 * instead of one global pair.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}
