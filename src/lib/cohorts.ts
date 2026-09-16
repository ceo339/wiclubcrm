// "Когортный анализ" — cohort-by-ad-campaign analysis (round 27, 16 сен 2026;
// reworked round 28, 16 сен 2026 — absolute calendar-month columns, filters).
//
// "А когортный анализ как отслеживать по рекламной компании?" (Anastasiia)
// followed by "Да! Давай так как ты предложила. По первому касанию
// считать" — she confirmed first-touch attribution: a contact is grouped
// into exactly one cohort, forever, by whichever source/campaign brought
// them in the very first time (see contacts.first_source/first_utm_campaign
// in src/lib/server/contacts.ts), never by a later deal's own source even
// if that later deal used a completely different campaign. This is a
// DIFFERENT "когорта" from `cohort_start_date` elsewhere in this app (a
// course поток/stream) — pure naming coincidence, not the same concept.
//
// A cohort here is one (acquisition month × first-touch campaign) bucket.
// For each cohort this computes: how many contacts landed in it, how many
// of them ever paid anything, and how much revenue arrived in each real
// calendar month (round 28: Anastasiia sent a reference cohort-analysis
// screenshot using actual month names as columns, not relative "M0/M1/…"
// offsets — see CohortReport.columns below) — the classic revenue/retention
// cohort heatmap.

import { currentMonthKey, monthKeyOf } from "@/lib/dashboard";

export type CohortContactInput = {
  id: string;
  /** contacts.created_at — this contact's very first touch, by definition
   * (findOrCreateContact only ever inserts once per person). */
  createdAt: string;
  firstSource: string | null;
  firstUtmCampaign: string | null;
};

export type CohortPaymentInput = {
  /** Already resolved by the caller (payments.member_id → members.contact_id,
   * falling back to payments.lead_id → leads.contact_id for the rare
   * lead_id-only fallback payment — see cleanupOrphanLeadPayment). Rows
   * that couldn't be traced to any contact are simply skipped. */
  contactId: string | null;
  amount: number;
  /** payments.paid_date, "YYYY-MM-DD". */
  paidDate: string;
};

export type CohortRow = {
  key: string;
  /** "YYYY-MM" — the month this cohort was acquired in. */
  month: string;
  /** Raw first-touch label to group by — a real utm_campaign, else a plain
   * source string, else null for "no attribution at all" (a manually added
   * contact/member — see the call sites findOrCreateContact.ts documents).
   * Rendering this into a human label (localizing a known SOURCES value,
   * or a literal "Без источника") is left to the caller/component, since
   * that needs the current locale. */
  campaignKey: string | null;
  /** Whichever of firstUtmCampaign/firstSource this cohort's label is
   * actually keyed on — lets the UI show "campaign (source)" when both are
   * known, e.g. a Facebook ad's specific campaign name alongside "Facebook"
   * as the channel. */
  isCampaign: boolean;
  contactsCount: number;
  paidContactsCount: number;
  /** 0–100, rounded to one decimal. */
  conversionPct: number;
  /** Every payment ever traced to this cohort's contacts, regardless of
   * how long ago — not capped to the `columns` range below. */
  totalRevenue: number;
  /** Revenue booked in each real calendar month, aligned 1:1 with
   * CohortReport.columns (same length/order for every row) — index 0 is
   * always columns[0], NOT "the acquisition month itself" as in the old
   * relative-offset scheme. A month before this row's own acquisition
   * month is simply 0, giving the usual "triangular" cohort-heatmap shape
   * without needing a separate flag for "not born yet" vs "no revenue". */
  monthly: number[];
};

export type CohortReport = {
  rows: CohortRow[];
  /** Every "YYYY-MM" from the earliest cohort's acquisition month through
   * the later of (the current month, the most recent payment observed) —
   * the shared column list every row's `monthly` is aligned to. Empty only
   * when `rows` itself is empty. */
  columns: string[];
};

/** The label to group a contact's cohort by — a real campaign name when
 * present, otherwise the plain source, otherwise null ("no attribution").
 * Trimmed/blank-guarded since a CSV import or manual entry can hand either
 * field an empty string rather than a true null. */
function cohortCampaignKey(contact: CohortContactInput): { key: string | null; isCampaign: boolean } {
  const campaign = contact.firstUtmCampaign?.trim() || null;
  if (campaign) return { key: campaign, isCampaign: true };
  const source = contact.firstSource?.trim() || null;
  return { key: source, isCampaign: false };
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computeCohortReport(contacts: CohortContactInput[], payments: CohortPaymentInput[]): CohortReport {
  type Bucket = {
    month: string;
    campaignKey: string | null;
    isCampaign: boolean;
    contactIds: Set<string>;
    paidContactIds: Set<string>;
    totalRevenue: number;
    /** month -> revenue, filled in below once `columns` is known. */
    byMonth: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();
  const contactToBucketKey = new Map<string, string>();

  for (const contact of contacts) {
    const month = monthKeyOf(contact.createdAt);
    const { key: campaignKey, isCampaign } = cohortCampaignKey(contact);
    const bucketKey = `${month}__${campaignKey ?? " none"}`;
    contactToBucketKey.set(contact.id, bucketKey);
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        month,
        campaignKey,
        isCampaign,
        contactIds: new Set(),
        paidContactIds: new Set(),
        totalRevenue: 0,
        byMonth: new Map(),
      };
      buckets.set(bucketKey, bucket);
    }
    bucket.contactIds.add(contact.id);
  }

  for (const payment of payments) {
    if (!payment.contactId) continue;
    const bucketKey = contactToBucketKey.get(payment.contactId);
    if (!bucketKey) continue; // payment traces to a contact outside this partner/period slice
    const bucket = buckets.get(bucketKey);
    if (!bucket) continue;
    bucket.paidContactIds.add(payment.contactId);
    bucket.totalRevenue += payment.amount;
    const paymentMonth = monthKeyOf(payment.paidDate);
    bucket.byMonth.set(paymentMonth, (bucket.byMonth.get(paymentMonth) ?? 0) + payment.amount);
  }

  if (buckets.size === 0) return { rows: [], columns: [] };

  // Build the shared column list — every real calendar month from the
  // earlier of (the earliest cohort, the earliest revenue observed) through
  // the later of "now" and the most recent revenue month actually observed.
  //
  // Round 28 — "Почему не взят первый месяц август? там же были оплаты?".
  // Almost the entire historical client base was bulk-entered into the CRM
  // in one stretch around 9–14 сен 2026 (see contacts/leads creation-date
  // audit, round 28 notes) — so `bucket.month` (a cohort's acquisition
  // month, keyed on when the CONTACT was added to the CRM) reads as
  // September for nearly everyone even though some of them paid for a real
  // course back in July/August, per `payments.paid_date`. There is no
  // recorded "true first touch" date anywhere in the data for that
  // pre-CRM backlog to fix the row's own acquisition month with — so this
  // only widens the COLUMN range to include those earlier revenue months
  // (a September-acquired row can still show real payments landing in an
  // earlier July/August column) rather than pretending the row itself was
  // "acquired" earlier than the data actually shows.
  let earliest = "";
  let latest = currentMonthKey();
  for (const bucket of buckets.values()) {
    if (!earliest || bucket.month < earliest) earliest = bucket.month;
    if (bucket.month > latest) latest = bucket.month;
    for (const paymentMonth of bucket.byMonth.keys()) {
      if (paymentMonth > latest) latest = paymentMonth;
      if (paymentMonth < earliest) earliest = paymentMonth;
    }
  }

  const columns: string[] = [];
  for (let key = earliest; key <= latest; key = shiftMonthKey(key, 1)) {
    columns.push(key);
    if (columns.length > 240) break; // sanity cap (20 years) — never expected in practice
  }

  const rows: CohortRow[] = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      month: b.month,
      campaignKey: b.campaignKey,
      isCampaign: b.isCampaign,
      contactsCount: b.contactIds.size,
      paidContactsCount: b.paidContactIds.size,
      conversionPct: b.contactIds.size > 0 ? Math.round((b.paidContactIds.size / b.contactIds.size) * 1000) / 10 : 0,
      totalRevenue: b.totalRevenue,
      monthly: columns.map((col) => b.byMonth.get(col) ?? 0),
    }))
    .sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return b.contactsCount - a.contactsCount;
    });

  return { rows, columns };
}
