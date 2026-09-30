"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import type { FranchiseStageId } from "@/lib/franchise";
import { isTerminalStage, stageIndex } from "@/lib/integrations/franchise";
import { isFranchisePaymentKind, isFranchisePaymentStatus } from "@/lib/franchisePayments";
import { canBillFranchise, canViewFranchise } from "@/lib/franchiseAccess";
import { nextInvoiceNumber, INVOICE_CANDIDATE_FIELDS, type InvoiceCandidate } from "@/lib/invoice/data";
import { sendInvoiceToPartner } from "@/lib/invoice/email";
import type { Tables } from "@/types/database";

export type FranchisePayment = Tables<"franchise_payments">;
export type PaymentActionResult = {
  error: string | null;
  stage?: FranchiseStageId;
  sentTo?: string;
  /** createFranchisePayment: the invoice row exists even though `error` is set (emailing failed). */
  saved?: boolean;
};

type Db = ReturnType<typeof createAdminClient>;

/** HQ, МПП (franchise_access = edit) and the finance director (= finance). */
async function billingProfile() {
  const profile = await getCurrentProfile();
  if (!profile || !canBillFranchise(profile)) return null;
  return profile;
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
 *
 * Round 49: runs on the admin client — the finance director may bill but
 * has no right to move pipeline cards herself (RLS on franchise_candidates),
 * and this stage move is a consequence of her billing, not a manual edit.
 */
async function syncStageFromPayments(
  db: Db,
  candidateId: string,
  profileId: string
): Promise<FranchiseStageId | undefined> {
  const [{ data: cand }, { data: lump }] = await Promise.all([
    db.from("franchise_candidates").select("stage").eq("id", candidateId).maybeSingle(),
    db
      .from("franchise_payments")
      .select("status")
      .eq("candidate_id", candidateId)
      .eq("kind", "lump_sum")
      .neq("status", "cancelled"),
  ]);
  if (!cand || !lump || lump.length === 0 || isTerminalStage(cand.stage)) return undefined;
  const target: FranchiseStageId = lump.every((p) => p.status === "paid") ? "invoice_paid" : "invoiced";
  if (stageIndex(cand.stage) >= stageIndex(target)) return undefined;

  await db.from("franchise_candidates").update({ stage: target }).eq("id", candidateId);
  await db.from("franchise_stage_history").insert({
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
  description: string | null;
  note: string | null;
  paid: boolean;
  paidDate: string | null;
  /** Round 49: email the invoice PDF to the franchisee right away. */
  sendNow?: boolean;
};

export async function createFranchisePayment(input: NewFranchisePayment): Promise<PaymentActionResult> {
  const profile = await billingProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!isFranchisePaymentKind(input.kind)) return { error: "errGeneric" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "fpErrAmount" };

  const supabase = await createClient();
  const invoiceDate = input.invoiceDate || today();
  const invoiceNumber = await nextInvoiceNumber(supabase, invoiceDate);
  const { data: created, error } = await supabase
    .from("franchise_payments")
    .insert({
      candidate_id: input.candidateId,
      kind: input.kind,
      amount: Math.round(input.amount * 100) / 100,
      invoice_date: invoiceDate,
      invoice_number: invoiceNumber,
      due_date: input.dueDate || null,
      period_month: input.kind === "royalty" && input.periodMonth ? `${input.periodMonth.slice(0, 7)}-01` : null,
      description: input.description?.trim() || null,
      note: input.note?.trim() || null,
      status: input.paid ? "paid" : "invoiced",
      paid_date: input.paid ? input.paidDate || today() : null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "errGeneric" };

  const stage = await syncStageFromPayments(createAdminClient(), input.candidateId, profile.id);

  let sentTo: string | undefined;
  if (input.sendNow && !input.paid) {
    const res = await sendInvoiceToPartner(supabase, created.id, { reminder: false, replyTo: await myEmail() });
    revalidate();
    // The invoice itself is saved either way — report the email problem.
    if (res.error) return { error: res.error, stage, saved: true };
    sentTo = res.sentTo;
  }
  revalidate();
  return { error: null, stage, sentTo };
}

/** The signed-in user's own email — used as Reply-To on partner emails. */
async function myEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

/** Round 49: email the invoice PDF to the franchisee (first send or a reminder). */
export async function sendFranchiseInvoice(paymentId: string, reminder: boolean): Promise<PaymentActionResult> {
  const profile = await billingProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const supabase = await createClient();
  const res = await sendInvoiceToPartner(supabase, paymentId, { reminder, replyTo: await myEmail() });
  revalidate();
  return res.error ? { error: res.error } : { error: null, sentTo: res.sentTo };
}

export async function setFranchisePaymentStatus(
  paymentId: string,
  status: string,
  paidDate?: string | null
): Promise<PaymentActionResult> {
  const profile = await billingProfile();
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

  const stage = await syncStageFromPayments(createAdminClient(), data.candidate_id, profile.id);
  revalidate();
  return { error: null, stage };
}

export async function deleteFranchisePayment(paymentId: string): Promise<PaymentActionResult> {
  const profile = await billingProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("franchise_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

// ── Round 49: franchisee requisites printed on the invoice ─────────────────

export type BillingDetails = Pick<
  InvoiceCandidate,
  "billing_name" | "billing_address" | "agreement_number" | "agreement_date" | "email" | "phone"
>;

export async function getCandidateBilling(candidateId: string): Promise<InvoiceCandidate | null> {
  const profile = await getCurrentProfile();
  if (!profile || !canViewFranchise(profile)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("franchise_candidates")
    .select(INVOICE_CANDIDATE_FIELDS)
    .eq("id", candidateId)
    .maybeSingle();
  return data ?? null;
}

/** Saved through the admin client after the permission check: the finance
 * director must be able to fill in invoice requisites, but RLS keeps every
 * other candidate field (stage, anketa) out of her reach. Only these six
 * columns are ever written here. */
export async function saveCandidateBilling(candidateId: string, input: BillingDetails): Promise<PaymentActionResult> {
  const profile = await billingProfile();
  if (!profile) return { error: "errNotAuthorized" };
  const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
  const agreementDate = clean(input.agreement_date);
  if (agreementDate && !/^\d{4}-\d{2}-\d{2}$/.test(agreementDate)) return { error: "errGeneric" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("franchise_candidates")
    .update({
      billing_name: clean(input.billing_name),
      billing_address: clean(input.billing_address),
      agreement_number: clean(input.agreement_number),
      agreement_date: agreementDate,
      email: clean(input.email),
      phone: clean(input.phone),
    })
    .eq("id", candidateId);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}
