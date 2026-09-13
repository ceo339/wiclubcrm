"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { findOrCreateContact } from "@/lib/server/contacts";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

export type ContactImportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  birthday?: string | null;
};

export type ContactImportResult = {
  error: string | null;
  /** New Контакт rows actually created. */
  created: number;
  /** Rows that matched (by email, then phone — same rule as everywhere
   * else) a contact already on file, and so were merged into it instead of
   * duplicating it. */
  matchedExisting: number;
  /** Rows with no name at all — nothing to import. */
  skippedEmpty: number;
};

/**
 * "нужно добавить функцию импорта контактов, тогда не будет путаницы, я
 * буду импортировать контакты, а не лиды" (Anastasiia, 13 сен 2026) —
 * confirmed scope (she chose this over the alternative): a plain list of
 * people — an old client list, a purchased list, anything that isn't itself
 * an ad-sourced inquiry — should be importable straight into Контакты, with
 * NO Лид/заявка created at all, so it never shows up on the Лиды board
 * looking like an active funnel entry. This is deliberately a much smaller
 * cousin of importLeads: no source/value/stage, no duplicate-skip UI — a
 * repeat row just finds and merges into the same Контакт (findOrCreateContact
 * already does this everywhere else), which is exactly what she wants here.
 */
export async function importContacts(rows: ContactImportRow[]): Promise<ContactImportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized", created: 0, matchedExisting: 0, skippedEmpty: 0 };
  if (!profile.partner_id) {
    return { error: "errHqNoClubImportContacts", created: 0, matchedExisting: 0, skippedEmpty: 0 };
  }

  const supabase = await createClient();
  const { data: existingBefore } = await supabase
    .from("contacts")
    .select("id")
    .eq("partner_id", profile.partner_id);
  const existingIds = new Set((existingBefore ?? []).map((c) => c.id));

  let created = 0;
  let matchedExisting = 0;
  let skippedEmpty = 0;

  for (const row of rows) {
    const name = (row.name || "").trim();
    if (!name) {
      skippedEmpty += 1;
      continue;
    }
    const contactId = await findOrCreateContact(supabase, profile.partner_id, {
      name,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      city: row.city?.trim() || null,
      birthday: row.birthday?.trim() || null,
      country: row.country?.trim() || null,
    });
    if (!contactId) continue;
    if (existingIds.has(contactId)) matchedExisting += 1;
    else {
      created += 1;
      existingIds.add(contactId);
    }
  }

  revalidatePath("/contacts");
  return { error: null, created, matchedExisting, skippedEmpty };
}

/**
 * "контакты нужно редактировать должна быть вся информация в карточке
 * контакта" (Anastasiia, 11 сен 2026) — a contact's shared fields used to be
 * read-only here (editable only from her Lead/Member card). Now the contact
 * card can edit them directly too, and — same mirroring rule updateMember
 * already applies in the other direction — the change is pushed back onto
 * every one of her leads and her member row, so all three stay one person
 * however she's approached.
 */
export async function updateContact(contactId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubEdit" };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;

  const supabase = await createClient();
  const { data: contact, error } = await supabase
    .from("contacts")
    .update({ name, phone, city, email, birthday })
    .eq("id", contactId)
    .eq("partner_id", profile.partner_id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!contact) return { error: "errGeneric" };

  await Promise.all([
    supabase.from("leads").update({ name, phone, email, city, birthday }).eq("contact_id", contactId),
    supabase.from("members").update({ name, phone, email, city, birthday }).eq("contact_id", contactId),
  ]);

  revalidatePath("/contacts");
  revalidatePath("/leads");
  revalidatePath("/members");
  return { error: null };
}

export type ContactDetail = {
  /** This contact's comments, aggregated across every lead she's ever made
   * plus her member card (if any) — comments live on those rows, not on
   * the contact itself, but "должна быть вся информация в карточке
   * контакта ... по комментариям" means seeing them all in one place
   * regardless of which lead/member card they were left on. */
  comments: (Tables<"comments"> & { sourceLabel: "lead" | "member" })[];
};

/**
 * Loads this contact's full comment history for the card — same lazy
 * on-demand pattern as getMemberDetail/getLeadDetail (avoids joining
 * comments for every row on the list page just to show them if a card
 * happens to be opened).
 */
export async function getContactDetail(contactId: string): Promise<ContactDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [] };

  const supabase = await createClient();
  const [{ data: contactRow }, { data: leadIdsRows }, { data: memberRow }] = await Promise.all([
    supabase.from("contacts").select("id").eq("id", contactId).maybeSingle(),
    supabase.from("leads").select("id").eq("contact_id", contactId),
    supabase.from("members").select("id").eq("contact_id", contactId).maybeSingle(),
  ]);
  if (!contactRow) return { comments: [] };

  const leadIds = (leadIdsRows ?? []).map((l) => l.id);
  const memberId = memberRow?.id ?? null;

  const [{ data: leadComments }, { data: memberComments }] = await Promise.all([
    leadIds.length
      ? supabase.from("comments").select("*").eq("entity_type", "lead").in("entity_id", leadIds)
      : Promise.resolve({ data: [] }),
    memberId
      ? supabase.from("comments").select("*").eq("entity_type", "member").eq("entity_id", memberId)
      : Promise.resolve({ data: [] }),
  ]);

  const comments = [
    ...(leadComments ?? []).map((c) => ({ ...c, sourceLabel: "lead" as const })),
    ...(memberComments ?? []).map((c) => ({ ...c, sourceLabel: "member" as const })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { comments };
}

/**
 * Adds a new comment from the contact card itself. Comments only live on a
 * lead or a member row (see the comments table's own entity_type check), so
 * this attaches to whichever one actually represents "talking to this
 * person right now": her member card if she's already a participant,
 * otherwise her most recent заявка. Errors plainly when neither exists yet
 * (a bare contact with no lead or member row) rather than silently
 * dropping the comment.
 */
export async function addContactComment(contactId: string, text: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errCommentEmpty" };

  const supabase = await createClient();
  const [{ data: memberRow }, { data: latestLead }] = await Promise.all([
    supabase.from("members").select("id").eq("contact_id", contactId).maybeSingle(),
    supabase
      .from("leads")
      .select("id")
      .eq("contact_id", contactId)
      .order("added_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const target = memberRow
    ? { entityType: "member" as const, entityId: memberRow.id }
    : latestLead
      ? { entityType: "lead" as const, entityId: latestLead.id }
      : null;

  if (!target) return { error: "errContactNoCardForComment" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const author = profile.full_name || user?.email || "Партнёр";

  const { error } = await supabase.from("comments").insert({
    partner_id: profile.partner_id,
    entity_type: target.entityType,
    entity_id: target.entityId,
    text: trimmed,
    author,
  });

  if (error) return { error: error.message };

  revalidatePath("/contacts");
  return { error: null };
}
