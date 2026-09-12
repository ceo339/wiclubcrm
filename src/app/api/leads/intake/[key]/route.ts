import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { duplicateKey, normalizeEmail, normalizePhone } from "@/lib/leads";

// Needs the Node runtime, same as the Stripe/Resend webhooks — this route
// isn't Edge-safe (uses the full supabase-js admin client).
export const runtime = "nodejs";

/**
 * "нужно сделать модуль, чтоб лиды падали с лендингов в срм и ютм метками"
 * (Anastasiia, 12 сен 2026) — a public, unauthenticated endpoint a landing
 * page's own form (Tilda's native webhook, or a plain fetch() from custom
 * HTML/JS) posts straight to. `[key]` is that club's own `partners.intake_key`
 * (see the add_lead_intake_utm_and_partner_key migration) — a random token
 * that says "which club", not a real auth scheme: same trust model as a
 * Zapier webhook URL. Uses the service_role admin client (no signed-in user
 * on an incoming webhook, so RLS would otherwise block every insert).
 *
 * Accepts either JSON or an urlencoded/multipart form body (Tilda's own
 * webhook sends JSON; a hand-written landing page can use either). Field
 * names are matched case-insensitively against a short list of common
 * aliases — see NAME_ALIASES/PHONE_ALIASES/EMAIL_ALIASES below — so this
 * works with Tilda's default field names ("Name"/"Phone"/"Email") without
 * her having to rename anything, though renaming a field's technical id to
 * exactly "name"/"phone"/"email" in Tilda's field settings is the most
 * reliable option if a field still doesn't come through.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const NAME_ALIASES = ["name", "имя", "fio", "full_name", "fullname", "ф.и.о."];
const PHONE_ALIASES = ["phone", "телефон", "tel", "phone_number", "номер"];
const EMAIL_ALIASES = ["email", "почта", "mail", "e-mail"];

function pick(fields: Record<string, unknown>, aliases: string[]): string | null {
  const lower = new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]));
  for (const alias of aliases) {
    const value = lower.get(alias);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function pickExact(fields: Record<string, unknown>, key: string): string | null {
  const lower = new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]));
  const value = lower.get(key.toLowerCase());
  return value !== undefined && value !== null && String(value).trim() !== "" ? String(value).trim() : null;
}

/** Buckets a raw utm_source/utm_medium pair into one of the app's fixed
 * SOURCES (see lib/leads.ts) so the existing "Источник" breakdown on the
 * dashboard stays meaningful — the granular utm_* values are still stored
 * on the lead itself for a closer look later. Anything unrecognized falls
 * back to "Website", same default createLead already uses. */
function inferSource(utmSource: string | null, utmMedium: string | null): string {
  const s = (utmSource ?? "").toLowerCase();
  const m = (utmMedium ?? "").toLowerCase();
  if (s.includes("instagram") || s === "ig") return "Instagram";
  if (s.includes("facebook") || s === "fb" || s.includes("meta")) return "Facebook";
  if (m.includes("referral")) return "Referral";
  return "Website";
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = await request.json();
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  try {
    const formData = await request.formData();
    const record: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const admin = createAdminClient();

  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("intake_key", key)
    .maybeSingle();
  if (!partner) return json({ ok: false, error: "unknown intake key" }, 404);

  const fields = await parseBody(request);

  const name = pick(fields, NAME_ALIASES);
  const phone = pick(fields, PHONE_ALIASES);
  const email = pick(fields, EMAIL_ALIASES);
  if (!name) return json({ ok: false, error: "missing name" }, 400);
  if (!phone && !email) return json({ ok: false, error: "missing phone or email" }, 400);

  const utmSource = pickExact(fields, "utm_source");
  const utmMedium = pickExact(fields, "utm_medium");
  const utmCampaign = pickExact(fields, "utm_campaign");
  const utmContent = pickExact(fields, "utm_content");
  const utmTerm = pickExact(fields, "utm_term");
  const landingUrl = pickExact(fields, "page_url") ?? pickExact(fields, "url") ?? request.headers.get("referer");

  // Same email-first-then-phone matching rule as createLead/findOrCreateContact
  // (see lib/leads.ts's duplicateKey) — scoped to this one club, so a
  // landing submission always attaches to the right existing Контакт
  // instead of creating a duplicate person for a repeat inquiry.
  let contactId: string | null = null;
  const dedupeKey = duplicateKey(email, phone);
  if (dedupeKey) {
    const { data: existingContacts } = await admin
      .from("contacts")
      .select("id, email, phone")
      .eq("partner_id", partner.id);
    const match = (existingContacts ?? []).find((c) =>
      dedupeKey.field === "email" ? normalizeEmail(c.email) === dedupeKey.value : normalizePhone(c.phone) === dedupeKey.value
    );
    contactId = match?.id ?? null;
  }
  if (!contactId) {
    const { data: createdContact } = await admin
      .from("contacts")
      .insert({ partner_id: partner.id, name, phone, email })
      .select("id")
      .single();
    contactId = createdContact?.id ?? null;
  }

  const { error } = await admin.from("leads").insert({
    partner_id: partner.id,
    contact_id: contactId,
    name,
    phone,
    email,
    source: inferSource(utmSource, utmMedium),
    stage: "new",
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    landing_url: landingUrl,
  });

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
}
