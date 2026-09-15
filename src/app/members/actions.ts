"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { currentMonthYear, enrollmentIsDueForCompletion, STATUSES } from "@/lib/members";
import { todayIso } from "@/lib/payments";
import { findOrCreateContact, loadContactHistory, type ContactHistory } from "@/lib/server/contacts";
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * "у екатерины есть оплата. но она не отображается во вкладке оплаты"
 * (Anastasiia, 11 сен 2026) — marking a course "Оплачено"/"Завершён" right
 * on a member's own card has always recorded the price on the enrollment
 * itself (member_enrollments.price/status), but that never created the
 * matching row in `payments` — the table the Оплаты tab and every revenue/
 * royalty figure on the dashboard actually reads from. This mirrors the
 * same idempotent insert updateLeadStage already does when a lead reaches
 * "Оплата": skip when there's nothing to record (no price), otherwise
 * insert one dated today.
 *
 * "Я исправила суммы оплат в участницах, но в оплатах они не подтянулись"
 * (Anastasiia, 14 сен 2026) — a corrected enrollment price used to just sit
 * there once a payment already existed for it (the old code returned early
 * on any existing payment, insert-only, never update). Now an existing
 * payment's amount is kept in sync with the enrollment's current price
 * instead of being frozen at whatever it was the first time this ran.
 */
export async function syncEnrollmentPayment(
  supabase: SupabaseServerClient,
  params: {
    partnerId: string;
    memberId: string;
    enrollmentId: string;
    productId: string | null;
    price: number;
    status: string;
  }
): Promise<void> {
  const { partnerId, memberId, enrollmentId, productId, price, status } = params;
  if (status !== "sPaid" && status !== "sCompleted") return;
  if (price <= 0) return;

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();

  if (existingPayment) {
    if (existingPayment.amount !== price) {
      await supabase.from("payments").update({ amount: price }).eq("id", existingPayment.id);
    }
    return;
  }

  await supabase.from("payments").insert({
    partner_id: partnerId,
    member_id: memberId,
    enrollment_id: enrollmentId,
    product_id: productId,
    amount: price,
    status: "paid",
    paid_date: todayIso(),
  });
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

  // A member created directly here (not via convertLeadToMember) still
  // needs a Контакт — same matching rule as a new lead, so a repeat person
  // added straight to Участницы still lines up with any lead she made
  // earlier or makes later.
  const contactId = await findOrCreateContact(supabase, profile.partner_id, { name, phone, email, city, birthday });
  if (contactId) await supabase.from("members").update({ contact_id: contactId }).eq("id", member.id);

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

    const { data: enrollment, error: enrollError } = await supabase
      .from("member_enrollments")
      .insert({
        partner_id: profile.partner_id,
        member_id: member.id,
        product_id: verifiedProductId,
        start_date: startDate,
        price,
        status,
        paid,
        attended: [],
      })
      .select("id")
      .single();
    // The member itself was created successfully either way — an enrollment
    // failure here isn't fatal, just means she'd need to add the course
    // from the card afterward. Surface it rather than swallowing it though.
    if (enrollError || !enrollment) {
      revalidatePath("/members");
      return { error: enrollError?.message ?? "errGeneric" };
    }

    await syncEnrollmentPayment(supabase, {
      partnerId: profile.partner_id,
      memberId: member.id,
      enrollmentId: enrollment.id,
      productId: verifiedProductId,
      price,
      status,
    });
  }

  revalidatePath("/members");
  revalidatePath("/contacts");
  revalidatePath("/payments");
  revalidatePath("/");
  return { error: null };
}

/**
 * Updates a member's own card. When she was converted from a lead
 * (member.lead_id set), the shared contact fields — name/phone/email/
 * city/birthday — are mirrored back onto that lead row too: Anastasiia's
 * request (11 сен 2026) that a lead and the participant she became are
 * "one contact" whichever card you edit it from. member_since is
 * membership-only and never touches the lead. The underlying Контакт row
 * (member.contact_id) gets the same fields mirrored too, so it stays the
 * canonical, up-to-date copy regardless of which card was actually edited.
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
    .select("lead_id, contact_id")
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
  if (existing?.contact_id) {
    await supabase.from("contacts").update({ name, phone, email, city, birthday }).eq("id", existing.contact_id);
  }

  revalidatePath("/members");
  revalidatePath("/leads");
  revalidatePath("/contacts");
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
 *
 * "Добавить курс — это тихая операция в обход воронки" (Anastasiia, 15 сен
 * 2026, про Наталью: закончила МК в августе, записалась на сентябрьский
 * поток тут же, с карточки Участницы, деньги ещё не пришли — а это никак
 * не попадало ни в канбан, ни в чей-либо список "кому напомнить про
 * оплату", потому что этот путь никогда не создавал Лид/сделку, только
 * запись в member_enrollments). Не убираем саму кнопку — она по-прежнему
 * нужна для уже решённого/оффлайн случая (заплатила наличными, просто
 * фиксируем факт). Но если курс добавляется НЕ оплаченным ("Записалась"),
 * функция теперь тихо заводит для неё сделку в Лидах на этапе "Записалась"
 * — именно так, как решили: "первый пункт уже делай". Привязана к тому же
 * Контакту, что и её карточка Участницы, поэтому "История контакта" на
 * этой новой сделке сразу покажет её прошлые курсы (loadContactHistory,
 * lib/server/contacts.ts, уже строится по contact_id — ничего отдельно
 * настраивать не пришлось). Идемпотентно: если для этого же контакта уже
 * есть открытая (не оплаченная и не отклонённая) сделка по этому же курсу
 * и потоку, вторая не создаётся.
 */
export async function addEnrollment(memberId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, contact_id, name, phone, email, city, birthday, country")
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

  const { data: enrollment, error } = await supabase
    .from("member_enrollments")
    .insert({
      partner_id: profile.partner_id,
      member_id: memberId,
      product_id: verifiedProductId,
      start_date: startDate,
      price,
      status,
      paid,
      attended: [],
    })
    .select("id")
    .single();

  if (error || !enrollment) return { error: error?.message ?? "errGeneric" };

  await syncEnrollmentPayment(supabase, {
    partnerId: profile.partner_id,
    memberId,
    enrollmentId: enrollment.id,
    productId: verifiedProductId,
    price,
    status,
  });

  if (status === "sAwaiting") {
    await createDealForUnpaidEnrollment(supabase, profile.partner_id, member, verifiedProductId, startDate, price);
  }

  revalidatePath("/members");
  revalidatePath("/leads");
  revalidatePath("/attendance", "layout");
  revalidatePath("/payments");
  revalidatePath("/");
  return { error: null };
}

/**
 * The actual "тихо заводит сделку" step used by addEnrollment above — kept
 * as its own function since it has its own separate concern (a Лид, not a
 * member_enrollment) and its own idempotency check. `source` is
 * deliberately left null ("Источник не указан") rather than guessed at —
 * this course interest didn't come through an ad or a landing page, it was
 * typed in by a partner from an existing member's card, and a wrong guess
 * here (e.g. defaulting to "Referral") would quietly corrupt the
 * "Какой канал приводит участниц" / "Откуда приходят лиды" attribution
 * reports Anastasiia is actively relying on — this is the exact "сквозная
 * аналитика" question she's still deciding on (15 сен 2026, paused
 * mid-conversation), so nothing is guessed here ahead of that decision.
 */
async function createDealForUnpaidEnrollment(
  supabase: SupabaseServerClient,
  partnerId: string,
  member: {
    id: string;
    contact_id: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    birthday: string | null;
    country: string | null;
  },
  productId: string | null,
  cohortStartDate: string | null,
  price: number
): Promise<void> {
  let contactId = member.contact_id;
  if (!contactId) {
    contactId = await findOrCreateContact(supabase, partnerId, {
      name: member.name,
      phone: member.phone,
      email: member.email,
      city: member.city,
      birthday: member.birthday,
      country: member.country,
    });
    if (contactId) await supabase.from("members").update({ contact_id: contactId }).eq("id", member.id);
  }
  if (!contactId) return;

  // Don't spawn a second deal if this exact course+поток is already an
  // open (not paid, not declined) Лид for this same contact — e.g. the
  // course was picked here after already being started as a proper lead,
  // or "Добавить курс" was used twice for the same signup.
  let existingQuery = supabase
    .from("leads")
    .select("id")
    .eq("contact_id", contactId)
    .neq("stage", "paid")
    .neq("stage", "declined");
  existingQuery = productId ? existingQuery.eq("product_id", productId) : existingQuery.is("product_id", null);
  existingQuery = cohortStartDate
    ? existingQuery.eq("cohort_start_date", cohortStartDate)
    : existingQuery.is("cohort_start_date", null);
  const { data: existingDeal } = await existingQuery.maybeSingle();
  if (existingDeal) return;

  await supabase.from("leads").insert({
    partner_id: partnerId,
    contact_id: contactId,
    name: member.name,
    phone: member.phone,
    email: member.email,
    city: member.city,
    birthday: member.birthday,
    country: member.country,
    product_id: productId,
    cohort_start_date: cohortStartDate,
    value: price,
    source: null,
    stage: "presented",
  });

  // Same contact_id as the member card, so LeadDetailModal's own
  // "История контакта" (loadContactHistory, lib/server/contacts.ts) shows
  // her other courses/leads on this new deal automatically — nothing else
  // to wire up for that.
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
  const { data: existing } = await supabase
    .from("member_enrollments")
    .select("member_id, product_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  const { error } = await supabase
    .from("member_enrollments")
    .update({ status, start_date: startDate, price, paid })
    .eq("id", enrollmentId);

  if (error) return { error: error.message };

  if (existing) {
    await syncEnrollmentPayment(supabase, {
      partnerId: profile.partner_id,
      memberId: existing.member_id,
      enrollmentId,
      productId: existing.product_id,
      price,
      status,
    });
  }

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  revalidatePath("/payments");
  revalidatePath("/contacts");
  revalidatePath("/");
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
  contactHistory: ContactHistory | null;
};

/**
 * Loads comments/tasks/enrollments for one member's detail card, plus her
 * Контакт's other заявки (leads) — the reverse direction of what
 * LeadDetailModal shows, so a member's card also surfaces "she asked about
 * X before becoming a member" instead of only her own courses.
 */
export async function getMemberDetail(memberId: string): Promise<MemberDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { comments: [], tasks: [], enrollments: [], contactHistory: null };

  await autoCompleteDueEnrollments();

  const supabase = await createClient();
  const { data: memberRow } = await supabase.from("members").select("contact_id").eq("id", memberId).maybeSingle();
  const [{ data: comments }, { data: tasks }, { data: enrollments }, contactHistory] = await Promise.all([
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
    loadContactHistory(supabase, memberRow?.contact_id ?? null),
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
    contactHistory,
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
