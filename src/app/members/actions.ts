"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { currentMonthYear, STATUSES } from "@/lib/members";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

function normalizeStatus(raw: string | undefined | null): string {
  const match = STATUSES.find((s) => s.id === raw);
  return match ? match.id : "sAwaiting";
}

/**
 * Same RLS rule as everywhere else: only a partner account (has
 * partner_id) can write members. HQ (partner_id null) is read-only
 * across the whole network.
 */
export async function createMember(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddMembers" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const productId = String(formData.get("product_id") || "").trim() || null;
  const startDate = String(formData.get("start_date") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const memberSince = String(formData.get("member_since") || "").trim() || currentMonthYear();
  const priceRaw = String(formData.get("price_collected") || "0").replace(",", ".");
  const priceCollected = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0;
  const paid = status === "sPaid" || status === "sCompleted";

  const supabase = await createClient();

  let verifiedProductId = productId;
  if (verifiedProductId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", verifiedProductId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) verifiedProductId = null;
  }

  const { error } = await supabase.from("members").insert({
    partner_id: profile.partner_id,
    name,
    status,
    product_id: verifiedProductId,
    start_date: startDate,
    city,
    email,
    member_since: memberSince,
    price_collected: priceCollected,
    paid,
    attended: [],
  });

  if (error) return { error: error.message };

  revalidatePath("/members");
  return { error: null };
}

export async function updateMember(memberId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubEdit" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const startDate = String(formData.get("start_date") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const memberSince = String(formData.get("member_since") || "").trim() || null;
  const priceRaw = String(formData.get("price_collected") || "0").replace(",", ".");
  const priceCollected = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0;
  const paid = status === "sPaid" || status === "sCompleted";

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      name,
      status,
      start_date: startDate,
      city,
      email,
      member_since: memberSince,
      price_collected: priceCollected,
      paid,
    })
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath("/members");
  return { error: null };
}

/**
 * Toggles one session's attendance mark for a member. `index` is the
 * position in the `attended` jsonb array (true = present, false = absent,
 * null = not yet marked) — sized to the enrolled product's session count.
 */
export async function setAttendance(
  memberId: string,
  index: number,
  value: boolean | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: member, error: fetchError } = await supabase
    .from("members")
    .select("attended")
    .eq("id", memberId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!member) return { error: "errMemberNotFound" };

  const attended = Array.isArray(member.attended) ? [...member.attended] : [];
  while (attended.length <= index) attended.push(null);
  attended[index] = value;

  const { error } = await supabase.from("members").update({ attended }).eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  return { error: null };
}

export type MemberDetail = {
  comments: Tables<"comments">[];
  tasks: Tables<"tasks">[];
};

export async function getMemberDetail(memberId: string): Promise<MemberDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [], tasks: [] };

  const supabase = await createClient();
  const [{ data: comments }, { data: tasks }] = await Promise.all([
    supabase
      .from("comments")
      .select("*")
      .eq("entity_type", "member")
      .eq("entity_id", memberId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("entity_type", "member")
      .eq("entity_id", memberId)
      .order("due_date", { ascending: true }),
  ]);

  return { comments: comments ?? [], tasks: tasks ?? [] };
}

export async function addMemberComment(memberId: string, text: string): Promise<ActionResult> {
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
    entity_type: "member",
    entity_id: memberId,
    text: trimmed,
    author,
  });

  if (error) return { error: error.message };

  revalidatePath("/members");
  return { error: null };
}

export async function addMemberTask(
  memberId: string,
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
    entity_type: "member",
    entity_id: memberId,
    text: trimmed,
    due_date: dueDate || null,
    done: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/members");
  return { error: null };
}

export async function setMemberTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/members");
  return { error: null };
}
