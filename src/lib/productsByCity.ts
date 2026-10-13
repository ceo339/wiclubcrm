import { localOf, sumLocal, type LocalAmount } from "@/lib/currency";

/**
 * Round 64 («виджет по 2 продуктам: Воркшоп в каждом из городов и тренинг
 * аналогично — заявки, записалось, оплатило, на сумму»).
 *
 * Pure function — no DB access — so it can be tested with plain arrays.
 * A product counts as a Workshop / Тренинг by its NAME (the two products are
 * created per club with the same name, see round 61), everything else on the
 * page is untouched.
 *
 *  - «Заявки»     = every lead of that product (declined ones included).
 *  - «Записалось» = every enrollment of that product (any status, same
 *                   convention as the «События» widget).
 *  - «Оплатили»   = enrollments sPaid / sCompleted.
 *  - «Сумма»      = sum of those enrollments' price (EUR) + local sum.
 *
 * One row per (club, product kind, stream date). A lead/enrollment without a
 * stream date (or with one the club has no cohort for) goes to the club's
 * nearest upcoming stream of that kind, else its latest one.
 */

export type ProductKind = "workshop" | "training";

export function productKind(name: string | null | undefined): ProductKind | null {
  const n = (name ?? "").toLowerCase();
  if (/workshop|воркшоп|ворк-шоп/.test(n)) return "workshop";
  if (/тренинг|трейнинг|training/.test(n)) return "training";
  return null;
}

export type ProductsByCityRow = {
  key: string;
  kind: ProductKind;
  /** Null = no stream (cohort) date known for this product yet. */
  startDate: string | null;
  leads: number;
  enrolled: number;
  paid: number;
  revenue: number;
  revenueLocal: LocalAmount | null;
};

export type ProductsByCityClub = {
  partnerId: string;
  name: string;
  rows: ProductsByCityRow[];
  total: Omit<ProductsByCityRow, "key" | "kind" | "startDate">;
};

const KIND_ORDER: ProductKind[] = ["workshop", "training"];

export function computeProductsByCity({
  partners,
  products,
  leads,
  enrollments,
  cohorts,
  today = new Date().toISOString().slice(0, 10),
}: {
  partners: { id: string; name: string }[];
  products: { id: string; name: string; partner_id?: string }[];
  leads: { partner_id?: string; product_id: string | null; cohort_start_date: string | null }[];
  enrollments: {
    partner_id?: string;
    product_id: string | null;
    start_date: string | null;
    status: string;
    price: number;
    price_local?: number | null;
    local_currency?: string | null;
  }[];
  cohorts: { partner_id?: string; product_id: string; start_date: string }[];
  today?: string;
}): ProductsByCityClub[] {
  const onlyOne = partners.length === 1 ? partners[0].id : null;
  const partnerOf = (row: { partner_id?: string }) => row.partner_id ?? onlyOne;

  const kindByProduct = new Map<string, ProductKind>();
  const clubOfProduct = new Map<string, string | null>();
  for (const p of products) {
    const k = productKind(p.name);
    if (!k) continue;
    kindByProduct.set(p.id, k);
    clubOfProduct.set(p.id, p.partner_id ?? onlyOne);
  }

  const result: ProductsByCityClub[] = [];
  for (const partner of partners) {
    const rows: ProductsByCityRow[] = [];
    for (const kind of KIND_ORDER) {
      const ids = new Set(
        [...kindByProduct.entries()]
          .filter(([id, k]) => k === kind && clubOfProduct.get(id) === partner.id)
          .map(([id]) => id)
      );
      if (ids.size === 0) continue;

      const myLeads = leads.filter((l) => l.product_id && ids.has(l.product_id) && partnerOf(l) === partner.id);
      const myEnr = enrollments.filter((e) => e.product_id && ids.has(e.product_id) && partnerOf(e) === partner.id);
      const myCohorts = cohorts.filter((c) => ids.has(c.product_id) && partnerOf(c) === partner.id);

      const dates = [...new Set([...myCohorts.map((c) => c.start_date)])].sort();
      // Streams that exist only through enrollments still get their own row.
      for (const e of myEnr) if (e.start_date && !dates.includes(e.start_date)) dates.push(e.start_date);
      dates.sort();
      const fallbackDate: string | null = dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? null;
      const bucket = (d: string | null): string | null => (d && dates.includes(d) ? d : fallbackDate);

      const rowDates: (string | null)[] = dates.length ? dates : [null];
      for (const d of rowDates) {
        const rl = myLeads.filter((l) => bucket(l.cohort_start_date) === d);
        const re = myEnr.filter((e) => bucket(e.start_date) === d);
        const paid = re.filter((e) => e.status === "sPaid" || e.status === "sCompleted");
        rows.push({
          key: `${partner.id}:${kind}:${d ?? "none"}`,
          kind,
          startDate: d,
          leads: rl.length,
          enrolled: re.length,
          paid: paid.length,
          revenue: paid.reduce((s, e) => s + Number(e.price), 0),
          revenueLocal: paid.length ? sumLocal(paid.map((e) => localOf(e.price_local, e.local_currency))) : null,
        });
      }
    }
    if (rows.length === 0) continue;
    const paidLocals = rows.map((r) => (r.paid > 0 ? r.revenueLocal : undefined));
    const withPaid = paidLocals.filter((x) => x !== undefined) as (LocalAmount | null)[];
    result.push({
      partnerId: partner.id,
      name: partner.name,
      rows,
      total: {
        leads: rows.reduce((s, r) => s + r.leads, 0),
        enrolled: rows.reduce((s, r) => s + r.enrolled, 0),
        paid: rows.reduce((s, r) => s + r.paid, 0),
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
        revenueLocal: withPaid.length ? sumLocal(withPaid) : null,
      },
    });
  }
  return result;
}
