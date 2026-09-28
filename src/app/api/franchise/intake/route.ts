import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addSystemComment,
  findCandidateByEmail,
  logIntegrationEvent,
  normalizeEmail,
  safeEqual,
} from "@/lib/integrations/franchise";
import type { TablesInsert, TablesUpdate } from "@/types/database";

export const runtime = "nodejs";

/**
 * Round 41 — «Стать партнером Woman Insight» Google-form → CRM.
 *
 * Google Forms can't call a webhook by itself, so a tiny Apps Script bound
 * to the form (docs/franchise-form-apps-script.gs) posts every new response
 * here as JSON:
 *   { submitted_at, email, answers: [{ title, answer }] }
 * with header `x-intake-secret: <FRANCHISE_INTAKE_SECRET>` (Vercel env var,
 * same value pasted into the script's Script Properties — never in code).
 *
 * Questions are matched by keywords in their TITLE (not by position), so
 * reordering the form or editing a hint doesn't break anything. Order below
 * matters — first match wins (e.g. the followers question mentions both
 * Instagram and Telegram, the "fears" hint mentions "вопросы").
 */
type Field = keyof TablesInsert<"franchise_candidates">;
const FIELD_RULES: { field: Field; test: (t: string) => boolean }[] = [
  { field: "email", test: (t) => t.includes("электронной почты") || t === "email" },
  { field: "name", test: (t) => t.includes("как тебя зовут") },
  { field: "followers", test: (t) => t.includes("подписчиков") },
  { field: "telegram", test: (t) => t.includes("telegram") },
  { field: "country", test: (t) => t.includes("в какой стране") },
  { field: "phone", test: (t) => t.includes("как с тобой связаться") || t.includes("телефон") },
  { field: "instagram_url", test: (t) => t.includes("instagram") },
  { field: "content_description", test: (t) => t.includes("контент") },
  { field: "source", test: (t) => t.includes("как ты узнала") },
  { field: "knows_method", test: (t) => t.includes("методик") || t.includes("sexfitness") },
  { field: "occupation", test: (t) => t.includes("чем ты занимаешься") },
  { field: "experience", test: (t) => t.includes("опыт в одной") },
  { field: "train_or_hire", test: (t) => t.includes("вести тренировки") || t.includes("нанять тренера") },
  { field: "ready_when", test: (t) => t.includes("готова начать") },
  { field: "budget", test: (t) => t.includes("бюджет") },
  { field: "why_city", test: (t) => t.includes("почему ты хочешь") },
  { field: "fears", test: (t) => t.includes("останавливает") || t.includes("пугает") },
  { field: "questions", test: (t) => t.includes("вопросы") },
  { field: "target_city", test: (t) => t.includes("в каком городе") },
  { field: "birth_date", test: (t) => t.includes("дата рождения") },
];

function parseBirthDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

type IntakeBody = {
  submitted_at?: string;
  email?: string;
  answers?: { title?: string; answer?: unknown }[];
};

export async function POST(request: Request) {
  const secret = process.env.FRANCHISE_INTAKE_SECRET;
  if (!secret) return NextResponse.json({ error: "FRANCHISE_INTAKE_SECRET is not configured" }, { status: 500 });
  const given = request.headers.get("x-intake-secret") ?? "";
  if (!safeEqual(given, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: IntakeBody;
  try {
    body = (await request.json()) as IntakeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row: Record<string, string | null> = {};
  for (const a of body.answers ?? []) {
    const title = (a.title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const raw = Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer ?? "");
    const value = raw.trim();
    if (!title || !value) continue;
    const rule = FIELD_RULES.find((r) => r.test(title));
    if (!rule || row[rule.field]) continue;
    row[rule.field] = rule.field === "birth_date" ? parseBirthDate(value) : value;
  }

  const email = normalizeEmail(body.email) ?? normalizeEmail(row.email);
  const submittedAt = body.submitted_at && !isNaN(Date.parse(body.submitted_at)) ? body.submitted_at : new Date().toISOString();
  const name = row.name?.trim() || email || "Без имени";

  const admin = createAdminClient();

  // Idempotency: the same response re-sent (script retried) → no duplicate.
  if (email) {
    const { data: dup } = await admin
      .from("franchise_candidates")
      .select("id")
      .ilike("email", email)
      .eq("submitted_at", submittedAt)
      .limit(1);
    if (dup?.[0]) {
      await logIntegrationEvent(admin, { source: "form", event_type: "response", status: "duplicate", candidate_id: dup[0].id });
      return NextResponse.json({ ok: true, duplicate: true, id: dup[0].id });
    }
  }

  // Calendly may have been booked a moment BEFORE the form response landed
  // (and created a bare candidate from Calendly data). If a candidate with
  // this email was created in the last 2 days, fill its empty anketa fields
  // instead of creating a second card for the same person.
  const recent = await findCandidateByEmail(admin, email);
  if (recent && Date.now() - Date.parse(recent.created_at) < 2 * 24 * 3600 * 1000) {
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && !(recent as Record<string, unknown>)[k]) patch[k] = v;
    }
    if (Object.keys(patch).length) await admin.from("franchise_candidates").update(patch as TablesUpdate<"franchise_candidates">).eq("id", recent.id);
    await addSystemComment(admin, recent.id, "Анкета (Google-форма) получена и добавлена в карточку.");
    await logIntegrationEvent(admin, { source: "form", event_type: "response", status: "merged", candidate_id: recent.id });
    return NextResponse.json({ ok: true, merged: true, id: recent.id });
  }

  const insert = {
    ...row,
    name,
    email,
    submitted_at: submittedAt,
    stage: "application",
  } as TablesInsert<"franchise_candidates">;

  const { data: created, error } = await admin.from("franchise_candidates").insert(insert).select("id").single();
  if (error || !created) {
    await logIntegrationEvent(admin, { source: "form", event_type: "response", status: "error", detail: error?.message, payload: body });
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  await admin.from("franchise_stage_history").insert({
    candidate_id: created.id,
    stage: "application",
    occurred_at: submittedAt,
    note: "Анкета (Google-форма)",
  });
  await logIntegrationEvent(admin, { source: "form", event_type: "response", status: "created", candidate_id: created.id });

  return NextResponse.json({ ok: true, id: created.id });
}
