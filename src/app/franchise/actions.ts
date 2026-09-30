"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isFranchiseStage, type FranchiseStageId } from "@/lib/franchise";
import type { Tables, TablesUpdate } from "@/types/database";
import { isTerminalStage, stageIndex } from "@/lib/integrations/franchise";

export type ActionResult = { error: string | null };

/**
 * Round 38's own "can touch this at all" check — mirrors the RLS policies
 * created alongside franchise_candidates (`is_hq() OR can_view_franchise()`/
 * `can_edit_franchise()`): RLS is the real backstop (a rejected write just
 * comes back as a Postgres permission error), this only fails fast with a
 * translated message instead, same reasoning as every other action file in
 * this app (see e.g. deleteLead's own comment in leads/actions.ts).
 */
function franchiseAccess(profile: { role: string; franchise_access: string }): {
  canView: boolean;
  canEdit: boolean;
} {
  const isHq = profile.role === "hq";
  const canEdit = isHq || profile.franchise_access === "edit";
  // Round 49: the finance director sees the pipeline read-only.
  const canView = canEdit || profile.franchise_access === "view" || profile.franchise_access === "finance";
  return { canView, canEdit };
}

/**
 * Moves a candidate to a new stage and logs it to franchise_stage_history —
 * that history row (not a column on franchise_candidates itself) is what
 * gives every stage its own date (see lib/franchise.ts for why). Declined/
 * paused additionally records the free-text reason Anastasiia asked for
 * ("с причиной отказала") directly on the candidate row, same shape as
 * leads.decline_reason.
 */
export async function updateCandidateStage(
  candidateId: string,
  stage: FranchiseStageId,
  reason?: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };
  if (!isFranchiseStage(stage)) return { error: "errGeneric" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("franchise_candidates")
    .update({
      stage,
      reject_reason: stage === "declined" || stage === "paused" ? reason?.trim() || null : null,
    })
    .eq("id", candidateId);
  if (error) return { error: error.message };

  await supabase.from("franchise_stage_history").insert({
    candidate_id: candidateId,
    stage,
    created_by: profile.id,
  });

  revalidatePath("/franchise");
  return { error: null };
}

export async function setCandidateZoomUrl(
  candidateId: string,
  url: string | null
): Promise<ActionResult & { stage?: FranchiseStageId }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const clean = url?.trim() || null;
  const { data: current } = await supabase
    .from("franchise_candidates")
    .select("stage")
    .eq("id", candidateId)
    .maybeSingle();
  const { error } = await supabase
    .from("franchise_candidates")
    .update({ zoom_recording_url: clean })
    .eq("id", candidateId);
  if (error) return { error: error.message };

  // Round 48: a Zoom recording added by hand moves the card to «Фин. модель
  // отправлена», same rule as the Zoom webhook — forward only, never out of
  // declined/paused. (Restored in round 49: commit 0ce2339 «Анкета» had
  // overwritten this function with an older copy.)
  let movedTo: FranchiseStageId | undefined;
  if (clean && current && !isTerminalStage(current.stage) && stageIndex(current.stage) < stageIndex("fin_model_sent")) {
    await supabase.from("franchise_candidates").update({ stage: "fin_model_sent" }).eq("id", candidateId);
    await supabase.from("franchise_stage_history").insert({
      candidate_id: candidateId,
      stage: "fin_model_sent",
      created_by: profile.id,
      note: "Добавлена запись Zoom",
    });
    movedTo = "fin_model_sent";
  }

  revalidatePath("/franchise");
  return { error: null, stage: movedTo };
}

/**
 * Manual interview scheduling (п.3 — "если они не забронировали время через
 * Calendly, мне нужно это делать через СРМ"). Calendly itself is round 39+
 * (Anastasiia's own phasing decision); this is just the CRM-side fallback
 * date field on the candidate row, shown on the card the same way whether it
 * got there via Calendly (future round) or typed in here.
 */
export async function setCandidateInterviewDate(candidateId: string, date: string | null): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("franchise_candidates")
    .update({ interview_scheduled_at: date || null })
    .eq("id", candidateId);
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  return { error: null };
}

/**
 * The "АНКЕТА" block on the candidate card (CandidateDetailModal) — the raw
 * intake-form answers. Until now these came in once via the public intake
 * form (api/franchise/intake) and were never editable in the CRM itself —
 * "Сделай редактируемые поля анкеты" (Anastasiia, round 47/48): a typo in a
 * phone/email, or a field the candidate skipped, had no way to be fixed
 * short of editing the row directly in Supabase. Same field set the card
 * already renders (see CandidateDetailModal's Field/LongField calls) —
 * name/stage/interview date/Zoom link/internal_note stay on their own
 * existing controls, not duplicated here.
 */
const APPLICATION_FIELD_KEYS = [
  "email",
  "phone",
  "telegram",
  "country",
  "target_city",
  "birth_date",
  "instagram_url",
  "followers",
  "source",
  "knows_method",
  "train_or_hire",
  "ready_when",
  "budget",
  "occupation",
  "experience",
  "content_description",
  "why_city",
  "fears",
  "questions",
] as const;

export type ApplicationFieldKey = (typeof APPLICATION_FIELD_KEYS)[number];

export async function updateCandidateApplicationFields(
  candidateId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };

  const patch: TablesUpdate<"franchise_candidates"> = {};
  for (const key of APPLICATION_FIELD_KEYS) {
    const raw = formData.get(key);
    patch[key] = raw === null ? null : String(raw).trim() || null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("franchise_candidates").update(patch).eq("id", candidateId);
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  return { error: null };
}

/** Round 49c: rename the candidate/partner from the card header. */
export async function setCandidateName(candidateId: string, name: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };
  const clean = name.trim();
  if (!clean) return { error: "errEnterName" };

  const supabase = await createClient();
  const { error } = await supabase.from("franchise_candidates").update({ name: clean }).eq("id", candidateId);
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  revalidatePath("/franchise/payments");
  revalidatePath("/contacts");
  return { error: null };
}

export type FranchiseCandidateDetail = {
  history: Tables<"franchise_stage_history">[];
  comments: Tables<"franchise_candidate_comments">[];
  /** Round 44 ("Добавь задачи в карточку лида") — same `tasks` table leads/
   * members already use, just entity_type = "franchise_candidate" and no
   * partner_id (a candidate isn't any one club's — see the migration that
   * made tasks.partner_id nullable for this entity_type). */
  tasks: Tables<"tasks">[];
};

/**
 * Loads a candidate's stage timeline + comment thread + open/done tasks,
 * fetched on demand when the card opens — same lazy pattern as
 * getLeadDetail in leads/actions.ts.
 */
export async function getCandidateDetail(candidateId: string): Promise<FranchiseCandidateDetail> {
  const profile = await getCurrentProfile();
  if (!profile) return { history: [], comments: [], tasks: [] };
  const { canView } = franchiseAccess(profile);
  if (!canView) return { history: [], comments: [], tasks: [] };

  const supabase = await createClient();
  const [{ data: history }, { data: comments }, { data: tasks }] = await Promise.all([
    supabase
      .from("franchise_stage_history")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("franchise_candidate_comments")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("entity_type", "franchise_candidate")
      .eq("entity_id", candidateId)
      .order("due_date", { ascending: true }),
  ]);

  return { history: history ?? [], comments: comments ?? [], tasks: tasks ?? [] };
}

/**
 * Same shape/rules as leads/actions.ts's own addTask/setTaskDone, just
 * against a franchise candidate instead of a lead — gated on franchise
 * edit access (not profile.partner_id, which a franchise candidate has
 * nothing to do with) and written with partner_id: null (see the
 * tasks_partner_id_matches_entity_type check constraint added for this).
 */
export async function addCandidateTask(
  candidateId: string,
  text: string,
  dueDate: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errEnterTaskText" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    partner_id: null,
    entity_type: "franchise_candidate",
    entity_id: candidateId,
    text: trimmed,
    due_date: dueDate || null,
    done: false,
  });
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  revalidatePath("/");
  return { error: null };
}

export async function setCandidateTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canEdit } = franchiseAccess(profile);
  if (!canEdit) return { error: "errNotAuthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  revalidatePath("/");
  return { error: null };
}

/**
 * "должна быть возможность оставлять комментарии по кандидату разными
 * людьми, кто одобряет кандидата" (Anastasiia, п.7) — every commenter's own
 * name is stamped on their comment (author_name, denormalized same as
 * comments.author elsewhere in this app), so a candidate can collect
 * separate approve/review notes from HQ, Кристина, Людмила etc. without
 * needing its own "approvals" concept — the comment thread IS the approval
 * record. RLS lets both view- and edit-level franchise access comment
 * (franchise_candidate_comments_insert), not just editors — reviewing/
 * approving is exactly what a view-only account should still be able to do.
 */
export async function addCandidateComment(candidateId: string, text: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const { canView } = franchiseAccess(profile);
  if (!canView) return { error: "errNotAuthorized" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "errCommentEmpty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authorName = profile.full_name || user?.email || "—";

  const { error } = await supabase.from("franchise_candidate_comments").insert({
    candidate_id: candidateId,
    author_id: profile.id,
    author_name: authorName,
    body: trimmed,
  });
  if (error) return { error: error.message };

  revalidatePath("/franchise");
  return { error: null };
}
