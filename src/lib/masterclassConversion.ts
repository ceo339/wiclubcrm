// "Конверсия из МК в СФ" (Anastasiia, round 43, 29 сен 2026) — "сколько чел
// купило сф из тех, что были на МК? сделать по Мк последние 30 дней (по
// каждому отдельно) и виджет по всем мк. сколько было, сколько купили сф,
// конверсия мастер класса в оплату".
//
// МК ("мастер-класс") is every club's free/cheap trial session, СФ ("Секс.
// фитнес", the flagship paid course) is what a club hopes to upsell an
// attendee into. Neither is a dedicated concept in the schema — both are
// just ordinary `products` rows, freeform-named per club — but every real
// club so far names its trial product starting with "МК" and its flagship
// course starting with "СФ" (Cyrillic) or "SF" (Latin — WiClub Batumi
// spells it "SF0"), so that naming convention is the signal this file
// matches on. Matching by name rather than a hardcoded product id is the
// only option that survives a new club being onboarded with its own
// product rows (products have no `kind`/category column — see products
// table).
//
// Attendance has no dedicated flag either: a person who shows up to a МК
// becomes a `leads` row with that МК's `product_id` + `cohort_start_date`
// (see product_cohorts — a cohort is identified by that value pair, not
// its own id, same convention as upcomingCohorts below). Whether they later
// bought the СФ is answered by following `members.lead_id` (a lead that
// converts becomes a member carrying a reference back to it) to that
// member's own `payments.member_id`, and checking for a paid payment whose
// product is a СФ one — confirmed against real production data before
// writing this (a lead can carry two separate paid payments, one for the
// МК itself and a later one for a СФ course, both traceable through the
// same lead → member chain).

import { pctOf } from "@/lib/dashboard";

const MASTERCLASS_PREFIXES = ["мк", "mk"];
const TARGET_COURSE_PREFIXES = ["сф", "sf"];

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase("ru");
}

export function isMasterclassProduct(name: string): boolean {
  const n = normalizedName(name);
  return MASTERCLASS_PREFIXES.some((p) => n.startsWith(p));
}

export function isTargetCourseProduct(name: string): boolean {
  const n = normalizedName(name);
  return TARGET_COURSE_PREFIXES.some((p) => n.startsWith(p));
}

export type MasterclassCohortStat = {
  key: string;
  productId: string;
  courseName: string | null;
  startDate: string;
  attendedCount: number;
  boughtCount: number;
  conversion: number | null;
  /** Only set on the network-wide Главная — see `partnerNamesById` below. */
  partnerName?: string;
};

export type MasterclassConversionResult = {
  perCohort: MasterclassCohortStat[];
  total: { attendedCount: number; boughtCount: number; conversion: number | null };
};

export function computeMasterclassConversion({
  cohorts,
  leads,
  members,
  payments,
  products,
  partnerNamesById,
  windowDays = 30,
  now = new Date(),
}: {
  cohorts: { product_id: string; start_date: string; partner_id?: string }[];
  leads: { id: string; product_id: string | null; cohort_start_date: string | null; partner_id?: string }[];
  members: { id: string; lead_id: string | null }[];
  payments: { member_id: string | null; product_id: string | null; status: string | null }[];
  products: { id: string; name: string }[];
  /** Only pass for a multi-club (network-wide) list — adds `partnerName` to
   * each row, same convention as upcomingCohorts. */
  partnerNamesById?: Map<string, string>;
  windowDays?: number;
  now?: Date;
}): MasterclassConversionResult {
  const msPerDay = 24 * 60 * 60 * 1000;
  const today = now.toISOString().slice(0, 10);
  const startWindow = new Date(now.getTime() - windowDays * msPerDay).toISOString().slice(0, 10);

  const productNamesById = new Map(products.map((p) => [p.id, p.name]));
  const masterclassProductIds = new Set(products.filter((p) => isMasterclassProduct(p.name)).map((p) => p.id));
  const targetProductIds = new Set(products.filter((p) => isTargetCourseProduct(p.name)).map((p) => p.id));

  // A lead converts into at most one member (members.lead_id) — walking
  // that link is what makes a payment made well after the МК, under a
  // member's own id, still traceable back to the original МК lead.
  const memberIdByLeadId = new Map(
    members.filter((m): m is { id: string; lead_id: string } => !!m.lead_id).map((m) => [m.lead_id, m.id])
  );

  // Plain Set lookup instead of re-filtering the whole `payments` array per
  // lead — a club can have thousands of payment rows.
  const membersWhoBoughtTarget = new Set(
    payments
      .filter((p) => p.status === "paid" && p.product_id && p.member_id && targetProductIds.has(p.product_id))
      .map((p) => p.member_id as string)
  );

  function leadBoughtTarget(leadId: string): boolean {
    const memberId = memberIdByLeadId.get(leadId);
    return !!memberId && membersWhoBoughtTarget.has(memberId);
  }

  const perCohort: MasterclassCohortStat[] = cohorts
    .filter((c) => masterclassProductIds.has(c.product_id) && c.start_date >= startWindow && c.start_date <= today)
    .map((c) => {
      const attendees = leads.filter(
        (l) =>
          l.product_id === c.product_id &&
          l.cohort_start_date === c.start_date &&
          (c.partner_id === undefined || l.partner_id === c.partner_id)
      );
      const bought = attendees.filter((l) => leadBoughtTarget(l.id));
      return {
        key: `${c.partner_id ?? ""}:${c.product_id}:${c.start_date}`,
        productId: c.product_id,
        courseName: productNamesById.get(c.product_id) ?? null,
        startDate: c.start_date,
        attendedCount: attendees.length,
        boughtCount: bought.length,
        conversion: pctOf(bought.length, attendees.length),
        partnerName: partnerNamesById ? partnerNamesById.get(c.partner_id ?? "") : undefined,
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || (a.courseName ?? "").localeCompare(b.courseName ?? "", "ru"));

  const attendedCount = perCohort.reduce((sum, c) => sum + c.attendedCount, 0);
  const boughtCount = perCohort.reduce((sum, c) => sum + c.boughtCount, 0);

  return {
    perCohort,
    total: { attendedCount, boughtCount, conversion: pctOf(boughtCount, attendedCount) },
  };
}
