"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { currentMonthYear, enrollmentIsDueForCompletion, STATUSES } from "@/lib/members";
import type { Tables } from "@/types/database";

export type ActionResult = { error: string | null };

function normalizeStatus(raw: string | undefined | null): string {
  const match = STATUSES.find((s) => s.id === raw);
  return match ? match.id : "sAwaiting";
}

function parsePrice(raw: FormDataEntryValue | null): number {
  const value = Number(String(raw ?? "0").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Same RLS rule as everywhere else: only a partner account (has
 * partner_id) can write members. HQ (partner_id null) is read-only
 * across the whole network.
 *
 * A member is just the person now (name/city/email/member_since) — course
 * enrollments are separate rows in member_enrollments (see addEnrollment
 * below), since one member can be on several courses at once. If a course
 * was picked right in the "new member" form, this also creates that first
 * enrollment in the same call, so the common case (one course, right away)
 * still takes one step.
 */
export async function createMember(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubAddMembers" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  const memberSince = String(formData.get("member_since") || "").trim() || currentMonthYear();

  const supabase = await createClient();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      partner_id: profile.partner_id,
      name,
      phone,
      city,
      email,
      birthday,
      member_since: memberSince,
    })
    .select("id")
    .single();

  if (error || !member) return { error: error?.message ?? "errGeneric" };

  const productId = String(formData.get("product_id") || "").trim() || null;
  if (productId) {
    let verifiedProductId: string | null = productId;
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) verifiedProductId = null;

    const status = normalizeStatus(String(formData.get("status") || ""));
    const startDate = String(formData.get("start_date") || "").trim() || null;
    const price = parsePrice(formData.get("price"));
    const paid = status === "sPaid" || status === "sCompleted";

    const { error: enrollError } = await supabase.from("member_enrollments").insert({
      partner_id: profile.partner_id,
      member_id: member.id,
      product_id: verifiedProductId,
      start_date: startDate,
      price,
      status,
      paid,
      attended: [],
    });
    // The member itself was created successfully either way — an enrollment
    // failure here isn't fatal, just means she'd need to add the course
    // from the card afterward. Surface it rather than swallowing it though.
    if (enrollError) {
      revalidatePath("/members");
      return { error: enrollError.message };
    }
  }

  revalidatePath("/members");
  return { error: null };
}

/**
 * Updates a member's own card. When she was converted from a lead
 * (member.lead_id set), the shared contact fields — name/phone/email/
 * city/birthday — are mirrored back onto that lead row too: Anastasiia's
 * request (11 сен 2026) that a lead and the participant she became are
 * "one contact" whichever card you edit it from. member_since is
 * membership-only and never touches the lead.
 */
export async function updateMember(memberId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) {
    return { error: "errHqNoClubEdit" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "errEnterName" };

  const phone = String(formData.get("phone") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const birthday = String(formData.get("birthday") || "").trim() || null;
  const memberSince = String(formData.get("member_since") || "").trim() || null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("members")
    .select("lead_id")
    .eq("id", memberId)
    .maybeSingle();

  const { error } = await supabase
    .from("members")
    .update({ name, phone, city, email, birthday, member_since: memberSince })
    .eq("id", memberId);

  if (error) return { error: error.message };

  if (existing?.lead_id) {
    await supabase.from("leads").update({ name, phone, email, city, birthday }).eq("id", existing.lead_id);
  }

  revalidatePath("/members");
  revalidatePath("/leads");
  return { error: null };
}

/**
 * Sweeps this club's own "sPaid" enrollments and flips any that are due
 * (see enrollmentIsDueForCompletion in lib/members) to "sCompleted" —
 * Anastasiia asked for this to happen on its own rather than her having to
 * remember to change it by hand (11 сен 2026). Called on every Участницы
 * page load and right after marking attendance, so it catches up within
 * moments rather than needing a scheduled job. A safe no-op for hq
 * accounts: RLS's member_enrollments_update policy requires
 * partner_id = current_partner_id(), which is null for hq, so an hq
 * caller's update just matches zero rows instead of erroring.
 */
export async function autoCompleteDueEnrollments(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile?.partner_id) return;

  const supabase = await createClient();
  const { data: candidates } = await supabase
    .from("member_enrollments")
    .select("id, status, start_date, attended, products(sessions)")
    .eq("partner_id", profile.partner_id)
    .eq("status", "sPaid");

  const due = (candidates ?? [])
    .filter((e) => {
      const sessions = (e as { products?: { sessions: number | null } | null }).products?.sessions ?? null;
      return enrollmentIsDueForCompletion(e, sessions);
    })
    .map((e) => e.id);

  if (due.length === 0) return;

  await supabase.from("member_enrollments").update({ status: "sCompleted" }).in("id", due);
}

/**
 * Enrolls an existing member in one more course — the actual fix for "лид
 * должен переходить в статус участниц на конкретные курсы (может быть 2 и
 * более)": a member's card can now hold as many of these as she adds.
 * Price is always freely typed here (not derived from products.price), so a
 * discounted/negotiated amount for this one participant is just what she
 * types, no separate "discount price" field on the course itself needed.
 */
export async function addEnrollment(memberId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!member) return { error: "errMemberNotFound" };

  const productId = String(formData.get("product_id") || "").trim() || null;
  let verifiedProductId: string | null = productId;
  if (verifiedProductId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", verifiedProductId)
      .eq("partner_id", profile.partner_id)
      .maybeSingle();
    if (!product) verifiedProductId = null;
  }

  const status = normalizeStatus(String(formData.get("status") || ""));
  const startDate = String(formData.get("start_date") || "").trim() || null;
  const price = parsePrice(formData.get("price"));
  const paid = status === "sPaid" || status === "sCompleted";

  const { error } = await supabase.from("member_enrollments").insert({
    partner_id: profile.partner_id,
    member_id: memberId,
    product_id: verifiedProductId,
    start_date: startDate,
    price,
    status,
    paid,
    attended: [],
  });

  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  return { error: null };
}

export async function updateEnrollment(enrollmentId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubEdit" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const startDate = String(formData.get("start_date") || "").trim() || null;
  const price = parsePrice(formData.get("price"));
  const paid = status === "sPaid" || status === "sCompleted";

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_enrollments")
    .update({ status, start_date: startDate, price, paid })
    .eq("id", enrollmentId);

  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  return { error: null };
}

/** Removes one course from a member's card — she stays a member, just no
 * longer enrolled in that particular course. Doesn't touch any payment
 * already recorded against it (payments.enrollment_id just goes null). */
export async function deleteEnrollment(enrollmentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { error } = await supabase.from("member_enrollments").delete().eq("id", enrollmentId);
  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  return { error: null };
}

/**
 * Toggles one session's attendance mark for one course enrollment. `index`
 * is the position in the `attended` jsonb array (true = present, false =
 * absent, null = not yet marked) — sized to that course's session count.
 */
export async function setAttendance(
  enrollmentId: string,
  index: number,
  value: boolean | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: enrollment, error: fetchError } = await supabase
    .from("member_enrollments")
    .select("attended")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!enrollment) return { error: "errMemberNotFound" };

  const attended = Array.isArray(enrollment.attended) ? [...enrollment.attended] : [];
  while (attended.length <= index) attended.push(null);
  attended[index] = value;

  const { error } = await supabase.from("member_enrollments").update({ attended }).eq("id", enrollmentId);
  if (error) return { error: error.message };

  // Marking the last session can be exactly what makes this enrollment due
  // for "sCompleted" (multi-session courses finish by attendance) — check
  // right away instead of waiting for the next page load.
  await autoCompleteDueEnrollments();

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  return { error: null };
}

export type EnrollmentDetail = Tables<"member_enrollments"> & {
  product_name: string | null;
  product_price: number | null;
  product_sessions: number | null;
};

export type MemberDetail = {
  comments: Tables<"comments">[];
  tasks: Tables<"tasks">[];
  enrollments: EnrollmentDetail[];
};

export async function getMemberDetail(memberId: string): Promise<MemberDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [], tasks: [], enrollments: [] };

  await autoCompleteDueEnrollments();

  const supabase = await createClient();
  const [{ data: comments }, { data: tasks }, { data: enrollments }] = await Promise.all([
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
    supabase
      .from("member_enrollments")
      .select("*, products(name, price, sessions)")
      .eq("member_id", memberId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    comments: comments ?? [],
    tasks: tasks ?? [],
    enrollments: (enrollments ?? []).map((e) => ({
      ...e,
      product_name: (e as { products?: { name: string } | null }).products?.name ?? null,
      product_price: (e as { products?: { price: number } | null }).products?.price ?? null,
      product_sessions:
        (e as { products?: { sessions: number | null } | null }).products?.sessions ?? null,
    })),
  };
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
