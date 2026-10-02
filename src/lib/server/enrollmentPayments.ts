import type { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/payments";

// Round 53 (2 Oct 2026) — partial payments per поток.
//
// «Ангелина заплатила за СФ0 два раза… нужно сделать доплату и выбирать
// поток» (Anastasiia). Until now an enrollment (one поток of one course)
// was assumed to have exactly ONE payment: syncEnrollmentPayment read it
// with .maybeSingle() and overwrote its amount with the enrollment price.
// Now an enrollment has a full price (member_enrollments.price) and any
// number of payments linked by enrollment_id; the card shows «оплачено X
// из Y», and the status follows the money:
//   sum = 0 → «Записалась · не оплатила» (sAwaiting)
//   sum > 0 → «Оплачено» (sPaid), even if partial (Anastasiia, 2 Oct:
//             «считается оплаченным даже при частичной оплате»); a payment
//             is flagged partial by hand (payments.is_partial), and the card
//             shows «оплачено X из Y · остаток Z».
// Only those three statuses are ever recomputed — «Курс пройден», «Возврат»,
// «Не была», «Отменила запись» are set by hand / by other flows and left
// alone. Free courses (price 0) are never recomputed either.

type Db = Awaited<ReturnType<typeof createClient>>;

const MONEY_STATUSES = new Set(["sAwaiting", "sPartial", "sPaid"]);

/** Sum of non-refunded payments linked to one enrollment. */
export async function enrollmentPaidSum(db: Db, enrollmentId: string): Promise<number> {
  const { data } = await db.from("payments").select("amount, status").eq("enrollment_id", enrollmentId);
  return (data ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
}

export async function recomputeEnrollmentStatus(
  db: Db,
  enrollmentId: string,
  opts: { fullPayment?: boolean } = {}
): Promise<void> {
  const { data: e } = await db
    .from("member_enrollments")
    .select("id, status, price")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!e || !MONEY_STATUSES.has(e.status)) return;

  const sum = await enrollmentPaidSum(db, enrollmentId);
  const patch: { status?: string; paid?: boolean; price?: number } = {};

  // «Цена потока может быть разной» (2 Oct 2026): a payment NOT marked as
  // partial means «this is what this поток costs for her» — the price
  // follows what she actually paid. A partial one keeps the price, and the
  // card shows the remainder.
  if (opts.fullPayment && sum > 0 && Math.abs(sum - Number(e.price)) > 0.01) patch.price = Math.round(sum * 100) / 100;

  // «Считается оплаченным даже при частичной оплате»: any money in → «Оплачено».
  if (Number(e.price) > 0 || sum > 0) {
    const next = sum > 0 ? "sPaid" : "sAwaiting";
    if (next !== e.status) {
      patch.status = next;
      patch.paid = next === "sPaid";
    }
  }
  if (Object.keys(patch).length) await db.from("member_enrollments").update(patch).eq("id", enrollmentId);
}

/**
 * Keeps `payments` in step with a status chosen by hand on the card.
 *   «Возврат»            → every linked payment becomes refunded.
 *   «Оплачено»/«Пройден» → if nothing is linked yet, one payment for the
 *                          full price is recorded (the old behaviour for the
 *                          common one-payment case); a single refunded
 *                          payment is restored; a single payment ABOVE the
 *                          price is corrected down. Several payments, or one
 *                          below the price, are left as they are — that is a
 *                          real partial payment, shown as «оплачено X из Y».
 */
export async function syncEnrollmentPaymentRows(
  db: Db,
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
  const { data: rows } = await db.from("payments").select("id, amount, status").eq("enrollment_id", enrollmentId);
  const payments = rows ?? [];

  if (status === "sRefunded") {
    const ids = payments.filter((p) => p.status !== "refunded").map((p) => p.id);
    if (ids.length) await db.from("payments").update({ status: "refunded" }).in("id", ids);
    return;
  }

  if (status !== "sPaid" && status !== "sCompleted") return;
  if (price <= 0) return;

  if (payments.length === 0) {
    await db.from("payments").insert({
      partner_id: partnerId,
      member_id: memberId,
      enrollment_id: enrollmentId,
      product_id: productId,
      amount: price,
      status: "paid",
      paid_date: todayIso(),
    });
    return;
  }

  if (payments.length === 1) {
    const only = payments[0];
    const patch: { amount?: number; status?: string } = {};
    if (Number(only.amount) > price) patch.amount = price;
    if (only.status !== "paid") patch.status = "paid";
    if (Object.keys(patch).length) await db.from("payments").update(patch).eq("id", only.id);
  }
}
