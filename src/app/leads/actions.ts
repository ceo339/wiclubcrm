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
  const country = String(formData.get("country") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  const valueRaw = String(formData.get("value") || "0").replace(",", ".");
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ name, phone, email, country, city, birthday, note, value })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath("/leads");
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

/**
 * Turns a won lead into a member record — a one-way copy (name, city,
 * course, cohort date, amount), not a foreign-key link, matching how the
 * prototype kept leads and members as separate lists.
 */
export async function convertLeadToMember(leadId: string): Promise<ActionResult> {
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

  const { error } = await supabase.from("members").insert({
    partner_id: profile.partner_id,
    name: lead.name,
    status: "sPaid",
    product_id: lead.product_id,
    start_date: lead.cohort_start_date,
    city: lead.city,
    email: lead.email,
    member_since: currentMonthYear(),
    price_collected: lead.value ?? 0,
    paid: true,
    attended: [],
  });

  if (error) return { error: error.message };

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
