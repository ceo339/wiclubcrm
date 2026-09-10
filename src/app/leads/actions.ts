"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SOURCES, type StageId } from "@/lib/leads";
import { currentMonthYear } from "@/lib/members";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

function normalizeSource(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const match = SOURCES.find((s) => s.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
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

export async function createLead(formData: FormData): Promise<ActionResult> {
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

  const supabase = await createClient();

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
  let imported = 0;
  for (let i = 0; i < clean.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = clean.slice(i, i + IMPORT_CHUNK_SIZE);
    const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
    if (error) {
      return {
        error: "errImportPartial",
        imported,
        partialFailure: { total: clean.length, message: error.message },
      };
    }
    imported += count ?? chunk.length;
  }

  revalidatePath("/leads");
  return { error: null, imported };
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
