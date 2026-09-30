"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { todayIso } from "@/lib/payments";

export type ActionResult = { error: string | null };

function parseAmount(raw: FormDataEntryValue | null): number {
  const value = Number(String(raw ?? "0").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

/**
 * "Продажа пакета" (round 46/47) — Anastasiia's question: a client bought a
 * discounted bundle of courses (e.g. СФ0+СФ1+СФ2+СФ3) as one payment, but
 * the потоки (start dates) for the not-yet-started courses aren't known yet,
 * so there's nothing to enroll her into or to split the payment against on
 * those courses. This records the ONE real payment now (shown as a single
 * "Пакет" line in «Оплаты» — see payments/page.tsx) as a package_sales row,
 * plus one package_sale_items row per included course, all still "pending"
 * (no start_date/allocated_price/enrollment yet). Nothing here touches
 * `payments` or `member_enrollments` — the package total is deliberately
 * never counted as revenue anywhere; only assignPackageItem below creates
 * the real rows that do.
 */
export async function createPackageSale(memberId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "errEnterPackageLabel" };

  const totalPrice = parseAmount(formData.get("total_price"));
  const paidDate = String(formData.get("paid_date") || "").trim() || todayIso();
  const productIds = formData.getAll("product_id").map(String).filter(Boolean);
  if (productIds.length === 0) return { error: "errSelectPackageCourses" };

  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!member) return { error: "errMemberNotFound" };

  // Only this partner's own courses can go into the bundle — same
  // verification addEnrollment already does for a single course.
  const { data: verifiedProducts } = await supabase
    .from("products")
    .select("id")
    .eq("partner_id", profile.partner_id)
    .in("id", productIds);
  const verifiedIds = (verifiedProducts ?? []).map((p) => p.id);
  if (verifiedIds.length === 0) return { error: "errSelectPackageCourses" };

  const { data: sale, error } = await supabase
    .from("package_sales")
    .insert({
      partner_id: profile.partner_id,
      member_id: memberId,
      label,
      total_price: totalPrice,
      paid_date: paidDate,
    })
    .select("id")
    .single();
  if (error || !sale) return { error: error?.message ?? "errGeneric" };

  const { error: itemsError } = await supabase.from("package_sale_items").insert(
    verifiedIds.map((productId) => ({
      package_sale_id: sale.id,
      partner_id: profile.partner_id!,
      product_id: productId,
    }))
  );
  if (itemsError) return { error: itemsError.message };

  revalidatePath("/members");
  revalidatePath("/payments");
  return { error: null };
}

/**
 * "Может как-то добавлять по ходу даты потоков и оплату разносить вручную?"
 * (Anastasiia) — the actual "distribute by ходу" step: once one course's
 * поток becomes known, this fills in that course's share manually (she
 * confirmed "каждый раз указывать вручную" rather than an automatic even
 * split) and, from that moment on, treats it exactly like any other course
 * purchase: creates a normal member_enrollments row (so Посещаемость picks
 * it up — see attendance/page.tsx, which only ever looks at
 * member_enrollments) and a normal payments row linked via enrollment_id (so
 * it flows into every existing revenue total automatically, attributed to
 * this поток's start_date via paymentAttributionDate in lib/dashboard — "а
 * тогда оплата должна считаться по предоставленной услуге на главной").
 * paid_date on the payments row stays the package's own original paid_date
 * (that's when the money actually arrived) — only the *attribution* for
 * revenue purposes follows the поток date, via the enrollment.
 */
export async function assignPackageItem(itemId: string, formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const startDate = String(formData.get("start_date") || "").trim();
  if (!startDate) return { error: "errEnterCohortStartDate" };
  const allocatedPrice = parseAmount(formData.get("allocated_price"));

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("package_sale_items")
    .select("id, product_id, enrollment_id, package_sale_id, package_sales(member_id, paid_date)")
    .eq("id", itemId)
    .eq("partner_id", profile.partner_id)
    .maybeSingle();
  if (!item) return { error: "errGeneric" };
  if (item.enrollment_id) return { error: "errPackageItemAlreadyAssigned" };

  const sale = (item as { package_sales?: { member_id: string; paid_date: string } | null }).package_sales;
  if (!sale) return { error: "errGeneric" };

  const { data: enrollment, error: enrollError } = await supabase
    .from("member_enrollments")
    .insert({
      partner_id: profile.partner_id,
      member_id: sale.member_id,
      product_id: item.product_id,
      start_date: startDate,
      price: allocatedPrice,
      status: "sPaid",
      paid: true,
      attended: [],
    })
    .select("id")
    .single();
  if (enrollError || !enrollment) return { error: enrollError?.message ?? "errGeneric" };

  if (allocatedPrice > 0) {
    const { error: paymentError } = await supabase.from("payments").insert({
      partner_id: profile.partner_id,
      member_id: sale.member_id,
      enrollment_id: enrollment.id,
      product_id: item.product_id,
      amount: allocatedPrice,
      status: "paid",
      paid_date: sale.paid_date,
    });
    if (paymentError) return { error: paymentError.message };
  }

  const { error: updateError } = await supabase
    .from("package_sale_items")
    .update({ start_date: startDate, allocated_price: allocatedPrice, enrollment_id: enrollment.id })
    .eq("id", itemId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/members");
  revalidatePath("/attendance", "layout");
  revalidatePath("/payments");
  revalidatePath("/");
  return { error: null };
}

/**
 * Lets her delete a package sale she created by mistake — but only while
 * every course in it is still pending. Once even one поток has been
 * assigned, that item's enrollment/payment are real course records now (the
 * same kind deleteEnrollment leaves untouched when a course is removed from
 * a member's card), so the package itself is no longer just a scratch draft
 * and deleting it here is refused rather than silently orphaning them.
 */
export async function deletePackageSale(id: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "errNotAuthorized" };
  if (!profile.partner_id) return { error: "errHqNoClubGeneric" };

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("package_sale_items")
    .select("id, enrollment_id")
    .eq("package_sale_id", id)
    .eq("partner_id", profile.partner_id);

  if ((items ?? []).some((i) => i.enrollment_id)) return { error: "errPackageHasAssignedItems" };

  const { error } = await supabase.from("package_sales").delete().eq("id", id).eq("partner_id", profile.partner_id);
  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/payments");
  return { error: null };
}

export type PackageSaleItemDetail = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  allocated_price: number | null;
  start_date: string | null;
  enrollment_id: string | null;
};

export type PackageSaleDetail = {
  id: string;
  label: string;
  total_price: number;
  paid_date: string;
  items: PackageSaleItemDetail[];
};

/** Loaded alongside the rest of a member's card (MemberDetailModal) — same
 * refresh-after-mutation pattern as getMemberDetail in members/actions.ts. */
export async function getPackageSalesForMember(memberId: string): Promise<PackageSaleDetail[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("package_sales")
    .select("id, label, total_price, paid_date, package_sale_items(id, product_id, allocated_price, start_date, enrollment_id, products(name))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((sale) => ({
    id: sale.id,
    label: sale.label,
    total_price: sale.total_price,
    paid_date: sale.paid_date,
    items: (
      (sale as unknown as {
        package_sale_items: {
          id: string;
          product_id: string | null;
          allocated_price: number | null;
          start_date: string | null;
          enrollment_id: string | null;
          products: { name: string } | null;
        }[];
      }).package_sale_items ?? []
    ).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.products?.name ?? null,
      allocated_price: item.allocated_price,
      start_date: item.start_date,
      enrollment_id: item.enrollment_id,
    })),
  }));
}

export type PackageSaleRow = PackageSaleDetail & {
  member_name: string | null;
  partner_name: string | null;
};

/**
 * The Оплаты page's own read — same scoping the page already applies to
 * `payments` itself (RLS narrows to the caller's club; `scopePartnerId` is
 * the extra hq/viewer "one city picked in the header switcher" narrowing —
 * see payments/page.tsx), so a package sale shows up there exactly where the
 * matching real payments would.
 */
export async function getPackageSalesForPayments(scopePartnerId: string | null): Promise<PackageSaleRow[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createClient();
  let query = supabase
    .from("package_sales")
    .select(
      "id, label, total_price, paid_date, members(name), partners(name), package_sale_items(id, product_id, allocated_price, start_date, enrollment_id, products(name))"
    )
    .order("paid_date", { ascending: false });
  if (scopePartnerId) query = query.eq("partner_id", scopePartnerId);
  const { data } = await query;

  return (data ?? []).map((sale) => ({
    id: sale.id,
    label: sale.label,
    total_price: sale.total_price,
    paid_date: sale.paid_date,
    member_name: (sale as { members?: { name: string } | null }).members?.name ?? null,
    partner_name: (sale as { partners?: { name: string } | null }).partners?.name ?? null,
    items: (
      (sale as unknown as {
        package_sale_items: {
          id: string;
          product_id: string | null;
          allocated_price: number | null;
          start_date: string | null;
          enrollment_id: string | null;
          products: { name: string } | null;
        }[];
      }).package_sale_items ?? []
    ).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.products?.name ?? null,
      allocated_price: item.allocated_price,
      start_date: item.start_date,
      enrollment_id: item.enrollment_id,
    })),
  }));
}
