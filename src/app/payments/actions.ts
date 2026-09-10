"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { STATUSES, todayIso } from "@/lib/payments";

export type ActionResult = { error: string | null };

function normalizeStatus(raw: string | undefined | null): string {
  const match = STATUSES.find((s) => s.id === raw);
  return match ? match.id : "paid";
}

/**
 * Records a payment against an existing member. This is a manual ledger
 * entry — "this payment happened / is expected" — not a card-processing
 * integration, so there's no real-time status beyond what the partner
 * enters by hand.
 */
export async function createPayment(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — добавлять оплаты может только партнёр." };
  }

  const memberId = String(formData.get("member_id") || "").trim();
  if (!memberId) return { error: "Выберите участницу" };

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Укажите сумму" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();

  const supabase = await createClient();

  // Verify the member belongs to this partner and pull their product, so a
  // payment can't be attached to someone else's participant.
  const { data: member } = await supabase
    .from("members")
    .select("id, product_id")
    .eq("id", memberId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();

  if (!member) return { error: "Участница не найдена" };

  const { error } = await supabase.from("payments").insert({
    partner_id: profile.partner_id,
    member_id: member.id,
    product_id: member.product_id,
    amount,
    status,
    paid_date: paidDate,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}

export async function updatePayment(paymentId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) {
    return { error: "У аккаунта HQ нет своего клуба — редактировать может только партнёр." };
  }

  const amountRaw = String(formData.get("amount") || "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Укажите сумму" };

  const status = normalizeStatus(String(formData.get("status") || ""));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();

  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({ amount, status, paid_date: paidDate })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Не авторизовано" };
  if (!profile.partner_id) return { error: "У аккаунта HQ нет своего клуба." };

  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}
