// Pure helpers for the DSK payment webhook (round 58) — course recognition,
// test-payment detection, club-timezone dates, choosing a lead and a поток.
//
// Deliberately NO imports (no database, no framework, no "@/..." aliases):
// everything here is a plain function of its arguments, so it can be checked
// with a bare `node` script — see the commented examples at the bottom of the
// round-58 section in claude/wiclub-crm-dsk-autoenroll-spec.md.

/** «Тестовые платежи (сумма < 5 EUR или описание начинается с TEST)». */
export const TEST_PAYMENT_MAX_EUR = 5;

export function isTestPayment(amountEur: number | null, description: string | null): boolean {
  if (description && /^\s*test/i.test(description)) return true;
  return amountEur !== null && amountEur < TEST_PAYMENT_MAX_EUR;
}

/** Workshop «1+1 с подругой»: the payment description carries «1+1». */
const ONE_PLUS_ONE_RE = /(^|[^\d])1\s*\+\s*1(?!\d)/;

export function isOnePlusOne(description: string | null): boolean {
  return !!description && ONE_PLUS_ONE_RE.test(description);
}

function stripOnePlusOne(description: string): string {
  return description.replace(/(^|[^\d])1\s*\+\s*1(?!\d)/g, "$1 ");
}

// ---------------------------------------------------------------------------
// Course recognition
// ---------------------------------------------------------------------------

/**
 * Latin letters that stand for a Cyrillic one in a hand-typed course name —
 * either by look (C/С, E/Е, O/О…) or by sound (S/С, F/Ф) — folded to Cyrillic,
 * so «SF0», «sf0», «СФ0» and «CФ0» all normalise to the same string. Applied
 * to BOTH sides of every comparison, so the folding never has to be "right",
 * only consistent.
 */
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а",
  b: "в",
  c: "с",
  e: "е",
  f: "ф",
  h: "н",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  s: "с",
  t: "т",
  x: "х",
  y: "у",
};

/** Lower-case, Latin→Cyrillic look-alikes, letters and digits only (quotes,
 * dashes, spaces and punctuation vanish: «Тренинг "Искусство…"» ≈ тренингискусство…). */
export function normalizeText(raw: string): string {
  return normalizeWithBreaks(raw).text;
}

/** normalizeText plus, for every kept character, whether a separator (space,
 * punctuation) stood right before it in the original — so «СФ1, 21.10» can be
 * told apart from «СФ121»: `text` = "сф12110", `breaks[3]` = true. */
function normalizeWithBreaks(raw: string): { text: string; breaks: boolean[] } {
  const lower = raw.normalize("NFKC").toLowerCase().replace(/ё/g, "е");
  let text = "";
  const breaks: boolean[] = [];
  let sepBefore = true;
  for (const ch of lower) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      text += LATIN_TO_CYRILLIC[ch] ?? ch;
      breaks.push(sepBefore);
      sepBefore = false;
    } else {
      sepBefore = true;
    }
  }
  return { text, breaks };
}

/** Does `needle` occur in `hay` as a whole token — i.e. not glued to a digit on
 * a side where the needle itself has a digit («сф1» must not match «сф10»,
 * but does match «СФ1, 21.10»)? */
function containsWithBoundary(hay: string, breaks: boolean[], needle: string): boolean {
  if (needle.length === 0) return false;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) return false;
    const end = at + needle.length;
    const startsDigit = /\d/.test(needle[0]);
    const endsDigit = /\d/.test(needle[needle.length - 1]);
    const leftGlued = at > 0 && /\d/.test(hay[at - 1]) && !breaks[at];
    const rightGlued = end < hay.length && /\d/.test(hay[end]) && !breaks[end];
    if (!(startsDigit && leftGlued) && !(endsDigit && rightGlued)) return true;
    from = at + 1;
  }
}

/** Smallest edit distance between `needle` and ANY substring of `hay`
 * (Sellers' approximate substring matching) — copes with a typo in the course
 * name on either side («наслеждения» ↔ «наслаждения») inside a longer description. */
export function approxContainsDistance(hay: string, needle: string): number {
  const m = needle.length;
  if (m === 0) return 0;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let best = prev[m];
  for (let j = 1; j <= hay.length; j++) {
    const cur = [0];
    for (let i = 1; i <= m; i++) {
      const cost = needle[i - 1] === hay[j - 1] ? 0 : 1;
      cur[i] = Math.min(prev[i - 1] + cost, prev[i] + 1, cur[i - 1] + 1);
    }
    best = Math.min(best, cur[m]);
    prev = cur;
  }
  return best;
}

export type CatalogProduct = { id: string; name: string; aliases?: string[] | null };

export type ProductMatch =
  | { kind: "matched"; product: CatalogProduct; via: "name" | "alias" | "contains" | "fuzzy" }
  | { kind: "ambiguous"; candidates: CatalogProduct[] }
  | { kind: "none" };

function uniqueById(list: CatalogProduct[]): CatalogProduct[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/**
 * «Курс по orderDescription (точное название курса из CRM, затем алиасы)».
 * Tried in this order, the first step that finds exactly one course wins; a
 * step that finds several different courses stops the search as «ambiguous»
 * (never guess between two courses — the payment is kept unlinked instead):
 *   1. the whole description equals a course name;
 *   2. the whole description equals an alias of a course;
 *   3. a course name or alias occurs inside the description (the longest wins);
 *   4. a course name of 8+ letters occurs with at most a typo or two.
 * A «1+1» marker is ignored for matching («Workshop … 1+1» ≈ «Workshop …»).
 */
export function matchProduct(description: string | null, products: CatalogProduct[]): ProductMatch {
  if (!description || !description.trim()) return { kind: "none" };
  const { text: desc, breaks: descBreaks } = normalizeWithBreaks(stripOnePlusOne(description));
  if (!desc) return { kind: "none" };

  const names = products.map((p) => ({ p, key: normalizeText(p.name) })).filter((x) => x.key);
  const aliases = products.flatMap((p) =>
    (p.aliases ?? []).map((a) => ({ p, key: normalizeText(a) })).filter((x) => x.key)
  );

  const decide = (found: CatalogProduct[], via: "name" | "alias" | "contains" | "fuzzy"): ProductMatch | null => {
    const unique = uniqueById(found);
    if (unique.length === 1) return { kind: "matched", product: unique[0], via };
    if (unique.length > 1) return { kind: "ambiguous", candidates: unique };
    return null;
  };

  const exactName = decide(names.filter((x) => x.key === desc).map((x) => x.p), "name");
  if (exactName) return exactName;

  const exactAlias = decide(aliases.filter((x) => x.key === desc).map((x) => x.p), "alias");
  if (exactAlias) return exactAlias;

  // Contained name/alias: keep only the longest hits, so «СФ1» inside a
  // description that also spells out a longer course name doesn't compete.
  const hits = [...names, ...aliases].filter((x) => x.key.length >= 2 && containsWithBoundary(desc, descBreaks, x.key));
  if (hits.length > 0) {
    const longest = Math.max(...hits.map((h) => h.key.length));
    const top = hits.filter((h) => h.key.length === longest);
    const contained = decide(top.map((h) => h.p), "contains");
    if (contained) return contained;
  }

  // Typos: only for long names (a one-letter slip in «СФ0» vs «СФ1» is a different course).
  const fuzzy = names
    .filter((x) => x.key.length >= 8)
    .map((x) => ({ p: x.p, dist: approxContainsDistance(desc, x.key), tol: Math.min(2, Math.floor(x.key.length / 8)) }))
    .filter((x) => x.dist <= x.tol);
  if (fuzzy.length > 0) {
    const bestDist = Math.min(...fuzzy.map((x) => x.dist));
    const fuzzyMatch = decide(
      fuzzy.filter((x) => x.dist === bestDist).map((x) => x.p),
      "fuzzy"
    );
    if (fuzzyMatch) return fuzzyMatch;
  }

  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Dates in the club's time zone
// ---------------------------------------------------------------------------

/** Time zone a club's money is booked in. DSK is WiClub Sofia's terminal, so
 * anything unknown falls back to Europe/Sofia. */
export const DEFAULT_CLUB_TIME_ZONE = "Europe/Sofia";

const COUNTRY_TIME_ZONE: Record<string, string> = {
  Bulgaria: "Europe/Sofia",
  Georgia: "Asia/Tbilisi",
  Ukraine: "Europe/Kyiv",
};

export function clubTimeZone(country: string | null | undefined): string {
  return (country && COUNTRY_TIME_ZONE[country]) || DEFAULT_CLUB_TIME_ZONE;
}

/** «YYYY-MM-DD» of an instant as the wall clock reads in `timeZone` (not UTC). */
export function dateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The gateway's `paymentDate`: «DD.MM.YYYY HH:mm:ss», in UTC (confirmed by the
 * 6 Oct 2026 test: payload 13:00:17 while the bank page showed local time). */
export function parseDskPaymentDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const ms = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss ?? "0"));
  const date = new Date(ms);
  // Reject «31.02.2026» style overflow (Date.UTC silently rolls it over).
  if (date.getUTCDate() !== Number(dd) || date.getUTCMonth() !== Number(mm) - 1) return null;
  return date;
}

/**
 * `paid_date` for a payment: the day, in the club's time zone, on which the
 * bank took the money. Uses the gateway's own `paymentDate` when it parses and
 * is plausible (within 36 h of the callback arriving), otherwise the moment
 * the callback arrived — the two differ by seconds in practice. The old
 * `new Date().toISOString().slice(0,10)` was the UTC date, which is already
 * «yesterday» for the club between 00:00 and 02:00/03:00 Sofia time.
 */
export function paidDateForClub(
  paymentDateRaw: string | null | undefined,
  now: Date,
  country: string | null | undefined
): string {
  const parsed = parseDskPaymentDate(paymentDateRaw);
  const instant = parsed && Math.abs(now.getTime() - parsed.getTime()) <= 36 * 3600 * 1000 ? parsed : now;
  return dateInTimeZone(instant, clubTimeZone(country));
}

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

/**
 * Same phone number written two ways. The bank passes whatever the payer typed
 * («+359 88 111 2222», «00359881112222», «0881112222»), the club's lead has it
 * in yet another form — so exact digit equality (the rule for catching a
 * duplicate lead) misses the same person. Compared by the last 9 digits, which
 * drops «+359» / «00359» / the national «0» prefix; numbers shorter than 7
 * digits never match anything.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  if (da.length < 7 || db.length < 7) return false;
  const n = Math.min(9, da.length, db.length);
  return da.slice(-n) === db.slice(-n);
}

// ---------------------------------------------------------------------------
// Which lead, which поток
// ---------------------------------------------------------------------------

export type LeadCandidate = {
  id: string;
  stage: string;
  product_id: string | null;
  created_at: string;
};

export type LeadChoice =
  | { kind: "use"; lead: LeadCandidate; setProduct: boolean }
  | { kind: "create"; reason: "no_leads" | "only_declined" | "other_course" };

/**
 * «Несколько заявок — выбрать ту, у которой курс совпал, иначе самую свежую
 * активную». `productId` is the course recognised from the payment description
 * (null when there was none). Declined leads are never reused; a lead that is
 * already for a DIFFERENT course is left alone and a new lead is created for
 * this payment's course instead, so one person's two courses stay two deals.
 */
export function pickLead(candidates: LeadCandidate[], productId: string | null): LeadChoice {
  if (candidates.length === 0) return { kind: "create", reason: "no_leads" };
  const active = candidates
    .filter((l) => l.stage !== "declined")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  if (active.length === 0) return { kind: "create", reason: "only_declined" };

  if (productId) {
    const same = active.find((l) => l.product_id === productId);
    if (same) return { kind: "use", lead: same, setProduct: false };
    const bare = active.find((l) => !l.product_id);
    if (bare) return { kind: "use", lead: bare, setProduct: true };
    return { kind: "create", reason: "other_course" };
  }

  // No course in the description: the lead's own course decides.
  const withCourse = active.find((l) => l.product_id);
  return { kind: "use", lead: withCourse ?? active[0], setProduct: false };
}

export type CohortChoice = {
  /** The поток to enrol on, or null. */
  cohortDate: string | null;
  /** True when the club has to pick the поток by hand. */
  needsCohort: boolean;
};

/**
 * «Если у курса ровно один будущий поток — записать на него; иначе пометка
 * «выбрать поток»». A course with no потоки at all gets no mark (nothing to
 * choose from — same as «Нет запланированных потоков» elsewhere). A поток that
 * starts today still counts as upcoming. A поток the lead already carries
 * (chosen on the landing page or by hand) always wins over the automatic rule.
 */
export function chooseCohort(
  cohortDates: string[],
  todayInClubZone: string,
  leadCohortDate?: string | null
): CohortChoice {
  if (cohortDates.length === 0) return { cohortDate: null, needsCohort: false };
  if (leadCohortDate && cohortDates.includes(leadCohortDate)) return { cohortDate: leadCohortDate, needsCohort: false };
  const upcoming = cohortDates.filter((d) => d >= todayInClubZone);
  if (upcoming.length === 1) return { cohortDate: upcoming[0], needsCohort: false };
  return { cohortDate: null, needsCohort: true };
}

/** «ИВАН ИВАНОВ» (cardholder names come in capitals) → «Иван Иванов»;
 * a name that already has lower-case letters is left exactly as typed. */
export function tidyPersonName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** «DD.MM.YYYY» for a task text. */
export function formatDateRu(iso: string): string {
  return iso.split("-").reverse().join(".");
}
