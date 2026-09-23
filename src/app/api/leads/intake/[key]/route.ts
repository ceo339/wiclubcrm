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
 *
 * `utm_source`/`utm_medium`/`utm_campaign`/`utm_content`/`utm_term` and
 * `page_url`/`url` (round 7) and `product` (round 19, see PRODUCT_ALIASES
 * below) are all read the same way — plain top-level fields in the posted
 * body. Tilda does NOT forward these on its own: they only arrive here if
 * the landing page's own form has hidden fields with exactly these names,
 * filled in (by a small JS snippet reading the page's URL, or hardcoded for
 * `product`, since one landing page is normally about one specific course)
 * before the visitor submits. `page_url`/`url` is the one exception that
 * needs no such setup — Tilda always sends the landing page's own address
 * as the request's Referer header, which this route already falls back to.
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
// "чтоб отображался сразу продукт в заявке (продукт с лендинга)" (Anastasiia,
// 15 сен 2026) — a landing page almost always promotes one specific course,
// so it only ever needs to send its own course's NAME as one more hidden
// field (matched case-insensitively against this club's own `products` —
// see the lookup right before the `leads.insert` below) — never an id,
// which the landing page has no way to know. Anastasiia chose "course only,
// not a поток" — the стрим itself still gets picked by hand in the lead
// card, same as any lead without a landing page.
const PRODUCT_ALIASES = ["product", "course", "продукт", "курс", "course_name", "product_name"];
// "нужно с лендинга передавать не только название курса, но и дату старта
// потока" (Anastasiia, 23 сен 2026) — round 34. Same idea as PRODUCT_ALIASES
// above: the landing page already promotes one specific course AND
// (usually) one specific поток of it, so it can send that поток's start
// date as one more hidden field. Matched (see below, after the product
// itself resolves) against this club's own `product_cohorts` — never
// trusted blindly, so a typo/deleted поток just leaves cohort_start_date
// empty rather than attaching the lead to the wrong stream. This is also
// what makes round 33's "поток обязателен перед Оплатой" a non-issue for
// landing leads that pass a real cohort date — the lead already has both
// course and поток the moment it lands in Лиды.
const COHORT_ALIASES = ["cohort", "cohort_date", "start_date", "поток", "дата_старта", "дата старта"];
// "нужно создавать лид с продуктом, который на лендинге... Как реализовать,
// чтоб четко продукт передавался и цена?" (Anastasiia, 16 сен 2026) — the
// landing page can send its own explicit price as one more hidden field
// (useful when the same course is sold at different prices on different
// landing pages — an early-bird page, a regional page, etc.). When it
// doesn't (the common case — one price per course), the lead's value falls
// back to that course's own price from the "Курсы" catalog, resolved the
// same way as PRODUCT_ALIASES above — so "продукт передаётся точно" already
// carries its price with it, with zero extra setup on the landing page.
const PRICE_ALIASES = ["price", "цена", "value", "сумма", "amount"];

// Accepts the two formats a hidden landing-page field is realistically
// filled in with by hand: the same "YYYY-MM-DD" that <input type="date">
// (and product_cohorts.start_date itself) already uses everywhere else in
// this app, or a plain "DD.MM.YYYY"/"D.M.YYYY" a person might type without
// thinking about it. Anything else comes back null — never guessed — so an
// unrecognized format just leaves the lead without a поток, same as a
// product name that doesn't match anything.
function normalizeDateInput(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

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

/**
 * Round 31 — "webhook возвращает ошибку missing name на проверочный запрос
 * Tilda" (Anastasiia, 17 сен 2026), despite round 25 already special-casing
 * that exact ping. Root cause, confirmed with a standalone Node script
 * before touching this file (real Fetch API `Request`/`.formData()`, no
 * network needed): the old version trusted the incoming `Content-Type`
 * header to decide HOW to parse the body — `.formData()` throws for any
 * Content-Type it doesn't recognize as multipart/urlencoded (including
 * `text/plain`, which is exactly what some Tilda webhook deliveries carry
 * a JSON body under — a documented real-world quirk, see the qna.habr.com
 * thread on this route's Round 20 research). That throw was swallowed by
 * the `catch` below it, silently turning a real `{"test":"test"}` body
 * into an empty `{}` — which no longer matches round 25's one-field check,
 * so the ping fell straight through into "missing name".
 *
 * Fixed by not trusting the header at all: read the raw body text once,
 * try JSON.parse on it first (works whatever the header claims), and only
 * fall back to treating it as a plain querystring (`URLSearchParams`) when
 * it isn't valid JSON — covers Tilda's own `application/x-www-form-urlencoded`
 * submissions and a hand-written landing page's JSON POST equally, and
 * verified against both webhook ping shapes and real submission shapes in
 * that same standalone script before rolling it out here.
 */
async function parseBody(request: Request): Promise<Record<string, unknown>> {
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return {};
  }
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — fall through to querystring parsing below.
  }

  const record: Record<string, unknown> = {};
  new URLSearchParams(raw).forEach((value, key) => {
    record[key] = value;
  });
  return record;
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

  // Tilda's own webhook-verification ping — sent once, the moment she saves
  // the webhook URL in her site settings, before any real landing page has
  // gone live. It carries only `test=test`, no name/phone/email at all, and
  // Tilda treats anything other than a 200 back as "this webhook doesn't
  // work" and refuses to save it. Answered here with a plain 200 and no
  // lead created; a genuine submission (name+phone/email always present)
  // can never match this exact one-field shape, so real "missing name"
  // validation below is untouched.
  if (Object.keys(fields).length === 1 && pickExact(fields, "test") === "test") {
    return json({ ok: true, test: true });
  }

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
  // New in round 11 — an optional free-text note (e.g. the Facebook/
  // Instagram Lead Ads bridge sends the form's own custom-question answers
  // here, since a native Lead Ad form has no "message" field of its own).
  // Backward compatible: absent for every existing landing page, which
  // never sent this field.
  const note = pickExact(fields, "note");

  // Resolve the landing page's own course name (if it sent one) to a real
  // product belonging to THIS club — never trusted as an id, since a
  // landing page's hidden field can only ever hold a name it was set up
  // with by hand. No match (wrong spelling, course renamed/deleted since,
  // or the field wasn't sent at all) just leaves the lead without a
  // product, exactly like any other lead created with no course chosen —
  // never blocks the lead from being created.
  const productName = pick(fields, PRODUCT_ALIASES);
  let productId: string | null = null;
  let matchedProductPrice: number | null = null;
  if (productName) {
    const { data: products } = await admin.from("products").select("id, name, price").eq("partner_id", partner.id);
    const match = (products ?? []).find((p) => p.name.trim().toLowerCase() === productName.trim().toLowerCase());
    productId = match?.id ?? null;
    matchedProductPrice = match?.price ?? null;
  }

  // Same idea as the product resolution above, one level down: only
  // meaningful once a product has actually resolved (a поток without a
  // course makes no sense), and only ever an already-existing
  // product_cohorts date for THIS club's THIS course — never an arbitrary
  // typed date, same rule moveLeadToCohort already enforces for a manual
  // edit. Unrecognized format, no matching поток, or no product resolved
  // at all → cohortStartDate stays null, exactly like an unmatched product
  // name — never blocks the lead.
  const cohortRaw = pick(fields, COHORT_ALIASES);
  let cohortStartDate: string | null = null;
  if (cohortRaw && productId) {
    const normalized = normalizeDateInput(cohortRaw);
    if (normalized) {
      const { data: cohort } = await admin
        .from("product_cohorts")
        .select("start_date")
        .eq("partner_id", partner.id)
        .eq("product_id", productId)
        .eq("start_date", normalized)
        .maybeSingle();
      cohortStartDate = cohort?.start_date ?? null;
    }
  }

  // Explicit price from the landing page's own hidden field wins (see
  // PRICE_ALIASES above); otherwise fall back to the matched course's own
  // price so a resolved product never leaves the lead's value at 0.
  const priceRaw = pick(fields, PRICE_ALIASES);
  let value = 0;
  if (priceRaw) {
    const parsed = Number(priceRaw.replace(",", "."));
    value = Number.isFinite(parsed) ? parsed : 0;
  } else if (matchedProductPrice !== null) {
    value = matchedProductPrice;
  }

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
  // Computed once and reused below both for this lead's own `source` and,
  // when this submission is what creates a brand-new Контакт, for that
  // contact's permanent first-touch attribution (round 27, 16 сен 2026) —
  // a real ad campaign is exactly what a landing page submission is, so
  // this is the most valuable place in the whole app for that field to
  // ever get filled in correctly.
  const resolvedSource = inferSource(utmSource, utmMedium);

  if (!contactId) {
    const { data: createdContact } = await admin
      .from("contacts")
      .insert({
        partner_id: partner.id,
        name,
        phone,
        email,
        first_source: resolvedSource,
        first_utm_source: utmSource,
        first_utm_medium: utmMedium,
        first_utm_campaign: utmCampaign,
        first_utm_content: utmContent,
        first_utm_term: utmTerm,
      })
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
    source: resolvedSource,
    stage: "new",
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    landing_url: landingUrl,
    note,
    product_id: productId,
    cohort_start_date: cohortStartDate,
    value,
  });

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
}
