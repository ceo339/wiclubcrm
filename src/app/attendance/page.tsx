import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import { isNetworkRole, getViewScopePartnerId } from "@/lib/viewScope";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import AttendanceBoard, { type AttendanceCohort } from "@/components/attendance/AttendanceBoard";

export default async function AttendancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const networkView = isNetworkRole(profile.role);
  const scopePartnerId = await getViewScopePartnerId(profile);

  // RLS already scopes both queries to the caller's own club (or every club
  // for hq/viewer) — the .eq below only narrows further, when an hq/viewer
  // account has picked one specific city in the header switcher (Round 18).
  // The roster is enrollments now, not members directly — one member can
  // have several, each its own row here with its own attendance record.
  let cohortsQuery = supabase
    .from("product_cohorts")
    .select("id, product_id, start_date, partner_id, products(name, sessions), partners(name)")
    .order("start_date", { ascending: false });
  let enrollmentsQuery = supabase
    .from("member_enrollments")
    .select("id, partner_id, product_id, start_date, attended, members(name)");
  if (scopePartnerId) {
    cohortsQuery = cohortsQuery.eq("partner_id", scopePartnerId);
    enrollmentsQuery = enrollmentsQuery.eq("partner_id", scopePartnerId);
  }
  const [{ data: cohorts, error }, { data: enrollments }] = await Promise.all([
    cohortsQuery,
    enrollmentsQuery,
  ]);

  const { data: clubs } = networkView
    ? await supabase.from("partners").select("id, name").order("name")
    : { data: [] };

  const members = (enrollments ?? []).map((e) => ({
    id: e.id,
    name: (e as { members?: { name: string } | null }).members?.name ?? "—",
    partner_id: e.partner_id,
    product_id: e.product_id,
    start_date: e.start_date,
    attended: e.attended,
  }));

  const isHq = networkView && !scopePartnerId;
  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  const attendanceCohorts: AttendanceCohort[] = (cohorts ?? [])
    .map((c) => {
      const product = (c as { products?: { name: string; sessions: number | null } | null }).products;
      const partner = (c as { partners?: { name: string } | null }).partners;
      if (!product) return null; // product deleted — no honest name/session count to show
      return {
        id: c.id,
        partnerId: c.partner_id,
        partnerName: partner?.name ?? "—",
        productId: c.product_id,
        productName: product.name,
        sessions: product.sessions ?? 0,
        startDate: c.start_date,
      };
    })
    .filter((c): c is AttendanceCohort => c !== null);

  return (
    <AppShell
      profile={profile}
      title={<T k="navAttendance" />}
      clubs={clubs ?? []}
      activeClubId={scopePartnerId}
      headerExtra={
        <>
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
          <LocaleScope scope={localeScope.scope} fallback={localeScope.fallback} />
          <LocaleSwitcher />
        </>
      }
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          <T k="errLoadStreamsFailed" />: {error.message}
        </p>
      ) : (
        <AttendanceBoard
          cohorts={attendanceCohorts}
          members={members}
          isHq={isHq}
          ownPartnerId={profile.partner_id}
        />
      )}
    </AppShell>
  );
}
