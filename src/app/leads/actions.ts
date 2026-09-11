"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SOURCES, duplicateKey, normalizeEmail, normalizePhone, type DuplicateField, type StageId } from "@/lib/leads";
import { currentMonthYear } from "@/lib/members";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

function normalizeSource(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const match = SOURCES.find((s) => s.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
}

export type DuplicateMatch = { id: string; name: string; stage: string; field: DuplicateField };

/**
 * Looks for an existing lead of this partner matching the given email/phone
 * by the shared duplicateKey() rule (email first, then phone — see
 * lib/leads.ts). Fetches the partner's leads and compares client-side
 * rather than pushing the match into SQL, since phone numbers are
 * free-typed text (formatting varies) and need the same normalizePhone()
 * comparison used everywhere else in this feature — fine at the lead
 * volumes a single club has.
 */
async function findDuplicateInPartner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partnerId: string,
  email: string | null,
  phone: string | null,
  excludeLeadId?: string
): Promise<DuplicateMatch | null> {
  const key = duplicateKey(email, phone);
  if (!key) return null;

  let query = supabase
    .from("leads")
    .select("id, name, stage, email, phone")
    .eq("partner_id", partnerId);
  if (excludeLeadId) query = query.neq("id", excludeLeadId);
  const { data } = await query;
  if (!data) return null;

  if (key.field === "email") {
    const match = data.find((l) => normalizeEmail(l.email) === key.value);
    return match ? { id: match.id, name: match.name, stage: match.stage, field: "email" } : null;
  }
  const match = data.find((l) => normalizePhone(l.phone) === key.value);
  return match ? { id: match.id, name: match.name, stage: match.stage, field: "phone" } : null;
}

/**
 * Moves a lead to a new stage. RLS enforces that only the owning partner
 * can write to a lead — an HQ account (no partner_id) will simply be
 * rejected by the database, which is the correct behaviour (HQ is a
 * read-only aggregate view for now).
 */
export async function updateLeadStage(
  leadId: string,
  stage: StageId,
  decline?: { reason: string; note: string | null }
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      stage,
      decline_reason: stage === "declined" ? decline?.reason ?? null : null,
      decline_note: stage === "declined" ? decline?.note ?? null : null,
    })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type CreateLeadResult = ActionResult & { duplicate?: DuplicateMatch };

export async function createLead(formData: FormData): Promise<CreateLeadResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddLeads" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const source = normalizeSource(String(formData.get("source") || "Website")) ?? "Website";
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  let productId = String(formData.get("product_id") || "").trim() || null;
  let cohortStartDate = String(formData.get("cohort_start_date") || "").trim() || null;
  const plan = String(formData.get("plan") || "").trim() || null;
  const force = String(formData.get("force") || "") === "true";

  const supabase = await createClient();

  // "Не давать создавать новые дубли" — block by default (email first, then
  // phone — see duplicateKey), but let the form resubmit with force=true
  // once the partner has seen the existing match and still wants to add it
  // (e.g. a genuine repeat enquiry from the same person).
  if (!force) {
    const duplicate = await findDuplicateInPartner(supabase, profile.partner_id, email, phone);
    if (duplicate) {
      return { error: duplicate.field === "email" ? "errDuplicateEmail" : "errDuplicatePhone", duplicate };
    }
  }

  // The product id/cohort date arrive via a hidden form field, so re-verify
  // the product actually belongs to this partner before trusting it.
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) {
      productId = null;
      cohortStartDate = null;
    }
  }

  const { error } = await supabase.from("leads").insert({
    partner_id: profile.partner_id,
    name,
    phone,
    email,
    source,
    value,
    country,
    city,
    birthday,
    product_id: productId,
    cohort_start_date: cohortStartDate,
    plan,
    stage: "new",
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type ImportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  value?: number | null;
};

export type ImportResult = {
  error: string | null;
  imported: number;
  /** Only set when error === "errImportPartial" — see importLeads below. */
  partialFailure?: { total: number; message: string };
  /** Rows skipped because they matched an existing lead (email first, then
   * phone) or another row earlier in the same file. */
  duplicatesSkipped?: number;
};

const MAX_IMPORT_ROWS = 1000;
const IMPORT_CHUNK_SIZE = 200;

/**
 * Bulk-creates leads from parsed CSV rows (see ImportModal). Same RLS rule
 * as createLead — only a partner account (has partner_id) can insert.
 */
export async function importLeads(rows: ImportRow[]): Promise<ImportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized", imported: 0 };
  if (!profile.partner_id) {
    return {
      error: "errHqNoClubImportLeads",
      imported: 0,
    };
  }

  const clean = rows
    .map((r) => ({
      partner_id: profile.partner_id as string,
      name: (r.name || "").trim(),
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      source: normalizeSource(r.source),
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : 0,
      stage: "new" as const,
    }))
    .filter((r) => r.name.length > 0)
    .slice(0, MAX_IMPORT_ROWS);

  if (clean.length === 0) return { error: "errNoRowsWithName", imported: 0 };

  const supabase = await createClient();

  // Same email-first-then-phone rule as createLead, checked against both
  // this partner's existing leads and rows earlier in this same file (a
  // big CSV export can easily contain its own repeats).
  const { data: existing } = await supabase
    .from("leads")
    .select("email, phone")
    .eq("partner_id", profile.partner_id as string);
  const existingEmails = new Set(
    (existing ?? []).map((l) => normalizeEmail(l.email)).filter((v): v is string => v !== null)
  );
  const existingPhones = new Set(
    (existing ?? []).map((l) => normalizePhone(l.phone)).filter((v): v is string => v !== null)
  );

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let duplicatesSkipped = 0;
  const deduped = clean.filter((row) => {
    const key = duplicateKey(row.email, row.phone);
    if (!key) return true;
    const seen = key.field === "email" ? seenEmails : seenPhones;
    const existingSet = key.field === "email" ? existingEmails : existingPhones;
    if (seen.has(key.value) || existingSet.has(key.value)) {
      duplicatesSkipped++;
      return false;
    }
    seen.add(key.value);
    return true;
  });

  if (deduped.length === 0) {
    return {
      error: duplicatesSkipped > 0 ? "errImportAllDuplicates" : "errNoRowsWithName",
      imported: 0,
      duplicatesSkipped,
    };
  }

  let imported = 0;
  for (let i = 0; i < deduped.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + IMPORT_CHUNK_SIZE);
    const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
    if (error) {
      return {
        error: "errImportPartial",
        imported,
        partialFailure: { total: deduped.length, message: error.message },
        duplicatesSkipped,
      };
    }
    imported += count ?? chunk.length;
  }

  revalidatePath("/leads");
  return { error: null, imported, duplicatesSkipped };
}

/**
 * Updates the editable contact/detail fields on a lead from the detail
 * card. Stage changes still happen via the kanban drag (updateLeadStage) —
 * this only covers the fields the prototype's lead drawer let you see and
 * amend directly.
 */
export async function updateLead(leadId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubEdit" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  // Unlike createLead, an unrecognised/empty source here is saved as null
  // (not defaulted to "Website") — this is an edit, and a lead that had no
  // source before shouldn't gain a fabricated one just for being saved.
  const source = normalizeSource(String(formData.get("source") || ""));
  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ name, phone, email, source, country, city, birthday, note, value })
    .eq("id", leadId);

  if (error) return { error: error.message };

  // Lead and member are the same contact once she's been converted — keep
  // the shared fields (name/phone/email/city/birthday) mirrored onto her
  // member card too, so editing either one shows up in both (Anastasiia,
  // 11 сен 2026). member_since/stage/source/value/note stay one-sided:
  // those describe the funnel or the membership, not the person.
  await supabase.from("members").update({ name, phone, email, city, birthday }).eq("lead_id", leadId);

  revalidatePath("/leads");
  revalidatePath("/members");
  return { error: null };
}

export type LeadDetail = {
  comments: Tables<"comments">[];
  tasks: Tables<"tasks">[];
};

/**
 * Loads comments/tasks for one lead's detail card, fetched on demand when
 * the card opens rather than upfront with the whole leads list.
 */
export async function getLeadDetail(leadId: string): Promise<LeadDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [], tasks: [] };

  const supabase = await createClient();
  const [{ data: comments }, { data: tasks }] = await Promise.all([
    supabase
      .from("comments")
      .select("*")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .order("due_date", { ascending: true }),
  ]);

  return { comments: comments ?? [], tasks: tasks ?? [] };
}

export async function addComment(leadId: string, text: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errCommentEmpty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const author = profile.full_name || user?.email || "Партнёр";

  const { error } = await supabase.from("comments").insert({
    partner_id: profile.partner_id,
    entity_type: "lead",
    entity_id: leadId,
    text: trimmed,
    author,
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export async function addTask(
  leadId: string,
  text: string,
  dueDate: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errEnterTaskText" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    partner_id: profile.partner_id,
    entity_type: "lead",
    entity_id: leadId,
    text: trimmed,
    due_date: dueDate || null,
    done: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type ConvertCourseChoice = {
  productId: string | null;
  cohortStartDate: string | null;
  price: number | null;
};

/**
 * Turns a won lead into a member — linked by members.lead_id, not a
 * one-way copy: the lead and the participant she becomes are the same
 * contact from here on (Anastasiia, 11 сен 2026 — "по сути это 1 контакт и
 * 1 карточка клиента"). `updateLead`/`updateMember` keep the shared contact
 * fields (name/phone/email/city/birthday) mirrored between the two rows
 * whichever card gets edited.
 *
 * Calling this again for a lead that's already linked to a member does NOT
 * create a second member — it used to, and that was a real bug: clicking
 * "Сделать участницей" a second time (e.g. after reopening the card) just
 * inserted a brand-new row every time, which is exactly how "Даниела
 * Василева" ended up with two duplicate participant cards. Now it just adds
 * the chosen course as another enrollment on her existing member card,
 * which is the right behaviour anyway since a member can hold several
 * course enrollments at once.
 *
 * `choice` is whatever course/cohort/price was picked in the convert
 * dialog (LeadDetailModal) — can differ from whatever was already on the
 * lead; omitting it falls back to the lead's own product_id/
 * cohort_start_date/value (pre-picker behaviour).
 */
export async function convertLeadToMember(
  leadId: string,
  choice?: ConvertCourseChoice
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!lead) return { error: "errLeadNotFound" };

  const productId = choice ? choice.productId : lead.product_id;
  const cohortStartDate = choice ? choice.cohortStartDate : lead.cohort_start_date;
  const price = (choice ? choice.price : lead.value) ?? 0;

  // The chosen product id arrives from client state, so re-verify it
  // actually belongs to this partner before trusting it (same check as
  // createLead's product_id).
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) return { error: "errCourseNotFound" };
  }

  const { data: existingMember } = await supabase
    .from("members")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  let memberId = existingMember?.id ?? null;

  if (!memberId) {
    const { data: member, error } = await supabase
      .from("members")
      .insert({
        partner_id: profile.partner_id,
        lead_id: lead.id,
        name: lead.name,
        city: lead.city,
        email: lead.email,
        phone: lead.phone,
        birthday: lead.birthday,
        member_since: currentMonthYear(),
      })
      .select("id")
      .single();

    if (error || !member) return { error: error?.message ?? "errGeneric" };
    memberId = member.id;
  }

  if (productId) {
    const { error: enrollError } = await supabase.from("member_enrollments").insert({
      partner_id: profile.partner_id,
      member_id: memberId,
      product_id: productId,
      start_date: cohortStartDate,
      price,
      status: "sPaid",
      paid: true,
      attended: [],
    });
    if (enrollError) {
      revalidatePath("/leads");
      revalidatePath("/members");
      return { error: enrollError.message };
    }
  }

  revalidatePath("/leads");
  revalidatePath("/members");
  return { error: null };
}

/**
 * Deletes a lead outright — deliberately hq-only (Anastasiia's own
 * decision: partner/club logins never get a delete button, only the
 * "Управляющая компания" login does). The `leads_delete_hq` RLS policy is
 * the real backstop; this check just fails fast with a translated message
 * instead of surfacing a raw Postgres permission error.
 */
export async function deleteLead(leadId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (profile.role !== "hq") return { error: "errOnlyHqCanDelete" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { error: null };
}

export type DuplicateLeadRow = Tables<"leads"> & { partner_name: string | null };
export type DuplicateGroup = {
  key: string;
  field: DuplicateField;
  partnerName: string | null;
  leads: DuplicateLeadRow[];
};

/**
 * Scans every club's leads for duplicates, grouped per club — a lead at
 * Sofia and one at Batumi sharing an email isn't a duplicate, they're two
 * different clubs' bookings. Matched by the same email-first-then-phone
 * rule as createLead/importLeads (duplicateKey). HQ-only, since the only
 * thing you can do with a match (deleteLead) is HQ-only too.
 */
export async function findDuplicateLeads(): Promise<DuplicateGroup[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "hq") return [];

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("*, partners(name)")
    .order("added_date", { ascending: true });
  if (!leads) return [];

  const groups = new Map<string, DuplicateGroup>();
  for (const lead of leads) {
    const key = duplicateKey(lead.email, lead.phone);
    if (!key) continue;
    const partnerName = (lead as { partners?: { name: string } | null }).partners?.name ?? null;
    const groupKey = `${lead.partner_id}:${key.field}:${key.value}`;
    const row: DuplicateLeadRow = { ...lead, partner_name: partnerName };
    const existing = groups.get(groupKey);
    if (existing) existing.leads.push(row);
    else groups.set(groupKey, { key: groupKey, field: key.field, partnerName, leads: [row] });
  }

  return Array.from(groups.values()).filter((g) => g.leads.length > 1);
}
