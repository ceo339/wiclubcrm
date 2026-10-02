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

// 2 Oct 2026 fix — «я проверила вручную и купило 2 человека СФ, почему у
// тебя 1?» (Anastasiia, МК Чувственность 24.09, София). The old version
// counted ATTENDEES as МК leads (a person with two leads for the same МК
// counted twice, a test lead counted, real attendees recorded only as
// participants not counted at all) and BUYERS only through members.lead_id
// of that exact lead. Now, whenever the МК поток has participant records
// (member_enrollments), those are the attendees — minus «Не была на курсе» /
// cancelled / refunded / not paid — counted once per person (contact).
// A buyer is anyone of them who has a СФ enrollment (paid / completed) or a
// paid СФ payment, matched by member OR by contact. The old lead-based
// counting is kept only as a fallback for a МК поток with no participant
// records at all.

const ATTENDED_STATUSES = new Set(["sPaid", "sPartial", "sCompleted"]);
const BOUGHT_STATUSES = new Set(["sPaid", "sPartial", "sCompleted"]);

export function computeMasterclassConversion({
  cohorts,
  leads,
  members,
  payments,
  enrollments = [],
  products,
  partnerNamesById,
  windowDays = 30,
  now = new Date(),
}: {
  cohorts: { product_id: string; start_date: string; partner_id?: string }[];
  leads: { id: string; product_id: string | null; cohort_start_date: string | null; partner_id?: string; contact_id?: string | null }[];
  members: { id: string; lead_id: string | null; contact_id?: string | null }[];
  payments: { member_id: string | null; product_id: string | null; status: string | null }[];
  enrollments?: {
    member_id?: string | null;
    product_id: string | null;
    start_date: string | null;
    status: string;
    partner_id?: string;
  }[];
  products: { id: string; name: string }[];
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

  // One «person key» per human: contact if known, else the member id.
  const memberById = new Map(members.map((m) => [m.id, m]));
  const personOfMember = (memberId: string) => memberById.get(memberId)?.contact_id || `m:${memberId}`;
  const memberIdByLeadId = new Map(
    members.filter((m): m is typeof m & { lead_id: string } => !!m.lead_id).map((m) => [m.lead_id, m.id])
  );

  // Everyone (by person key) who bought a СФ.
  const buyers = new Set<string>();
  for (const p of payments) {
    if (p.status === "paid" && p.product_id && p.member_id && targetProductIds.has(p.product_id)) {
      buyers.add(personOfMember(p.member_id));
    }
  }
  for (const e of enrollments) {
    if (e.member_id && e.product_id && targetProductIds.has(e.product_id) && BOUGHT_STATUSES.has(e.status)) {
      buyers.add(personOfMember(e.member_id));
    }
  }

  const perCohort: MasterclassCohortStat[] = cohorts
    .filter((c) => masterclassProductIds.has(c.product_id) && c.start_date >= startWindow && c.start_date <= today)
    .map((c) => {
      const samePartner = (pid?: string) => c.partner_id === undefined || pid === c.partner_id;
      const cohortEnrollments = enrollments.filter(
        (e) => e.member_id && e.product_id === c.product_id && e.start_date === c.start_date && samePartner(e.partner_id)
      );

      let attendees: Set<string>;
      if (cohortEnrollments.length > 0) {
        attendees = new Set(
          cohortEnrollments.filter((e) => ATTENDED_STATUSES.has(e.status)).map((e) => personOfMember(e.member_id!))
        );
      } else {
        // Fallback: МК recorded only as leads.
        attendees = new Set(
          leads
            .filter((l) => l.product_id === c.product_id && l.cohort_start_date === c.start_date && samePartner(l.partner_id))
            .map((l) => {
              const memberId = memberIdByLeadId.get(l.id);
              return memberId ? personOfMember(memberId) : l.contact_id || `l:${l.id}`;
            })
        );
      }
      const boughtCount = [...attendees].filter((k) => buyers.has(k)).length;
      return {
        key: `${c.partner_id ?? ""}:${c.product_id}:${c.start_date}`,
        productId: c.product_id,
        courseName: productNamesById.get(c.product_id) ?? null,
        startDate: c.start_date,
        attendedCount: attendees.size,
        boughtCount,
        conversion: pctOf(boughtCount, attendees.size),
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
