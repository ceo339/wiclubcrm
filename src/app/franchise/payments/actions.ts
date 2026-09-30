"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { FranchiseStageId } from "@/lib/franchise";
import { isTerminalStage, stageIndex } from "@/lib/integrations/franchise";
import { isFranchisePaymentKind, isFranchisePaymentStatus } from "@/lib/franchisePayments";
import type { Tables } from "@/types/database";

export type FranchisePayment = Tables<"franchise_payments">;
export type PaymentActionResult = { error: string | null; stage?: FranchiseStageId };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function editorProfile() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const canEdit = profile.role === "hq" || profile.franchise_access === "edit";
  return canEdit ? profile : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * «Автоматически» (Anastasiia's choice): the паушальный взнос drives the two
 * payment stages of the pipeline. Any non-cancelled lump-sum invoice →
 * «Выставлен счёт»; every non-cancelled lump-sum invoice paid → «Счёт
 * оплачен». Forward-only — a card already further along (e.g. «Активен») or
 * declined/paused is never moved back. Royalty/training invoices don't touch
 * the stage: they come after the franchisee is already active.
 */
async function syncStageFromPayments(
  supabase: Supabase,
  candidateId: string,
  profileId: string
): Promise<FranchiseStageId | undefined> {
  const [{ data: cand }, { data: lump }] = await Promise.all([
    supabase.from("franchise_candidates").select("stage").eq("id", candidateId).maybeSingle(),
    supabase
      .from("franchise_payments")
      .select("status")
      .eq("candidate_id", candidateId)
      .eq("kind", "lump_sum")
      .neq("status", "cancelled"),
  ]);
  if (!cand || !lump || lump.length === 0 || isTerminalStage(cand.stage)) return undefined;
  const target: FranchiseStageId = lump.every((p) => p.status === "paid") ? "invoice_paid" : "invoiced";
  if (stageIndex(cand.stage) >= stageIndex(target)) return undefined;

  await supabase.from("franchise_candidates").update({ stage: target }).eq("id", candidateId);
  await supabase.from("franchise_stage_history").insert({
    candidate_id: candidateId,
    stage: target,
    created_by: profileId,
    note: target === "invoice_paid" ? "Паушальный взнос оплачен" : "Выставлен счёт на паушальный взнос",
  });
  return target;
}

function revalidate() {
  revalidatePath("/franchise");
  revalidatePath("/franchise/payments");
}

export async function getCandidatePayments(candidateId: string): Promise<FranchisePayment[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("franchise_payments")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("invoice_date", { ascending: false });
  return data ?? [];
}

export type NewFranchisePayment = {
  candidateId: string;
  kind: string;
  amount: number;
  invoiceDate: string | null;
  dueDate: string | null;
  periodMonth: string | null;
  note: string | null;
  paid: boolean;
  paidDate: string | null;
};

export async function createFranchisePayment(input: NewFranchisePayment): Promise<PaymentActionResult> {
  const profile = await editorProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!isFranchisePaymentKind(input.kind)) return { error: "errGeneric" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "fpErrAmount" };

  const supabase = await createClient();
  const { error } = await supabase.from("franchise_payments").insert({
    candidate_id: input.candidateId,
    kind: input.kind,
    amount: Math.round(input.amount * 100) / 100,
    invoice_date: input.invoiceDate || today(),
    due_date: input.dueDate || null,
    period_month: input.kind === "royalty" && input.periodMonth ? `${input.periodMonth.slice(0, 7)}-01` : null,
    note: input.note?.trim() || null,
    status: input.paid ? "paid" : "invoiced",
    paid_date: input.paid ? input.paidDate || today() : null,
    created_by: profile.id,
  });
  if (error) return { error: error.message };

  const stage = await syncStageFromPayments(supabase, input.candidateId, profile.id);
  revalidate();
  return { error: null, stage };
}

export async function setFranchisePaymentStatus(
  paymentId: string,
  status: string,
  paidDate?: string | null
): Promise<PaymentActionResult> {
  const profile = await editorProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!isFranchisePaymentStatus(status)) return { error: "errGeneric" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("franchise_payments")
    .update({
      status,
      paid_date: status === "paid" ? paidDate || today() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .select("candidate_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "errGeneric" };

  const stage = await syncStageFromPayments(supabase, data.candidate_id, profile.id);
  revalidate();
  return { error: null, stage };
}

export async function deleteFranchisePayment(paymentId: string): Promise<PaymentActionResult> {
  const profile = await editorProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("franchise_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}
