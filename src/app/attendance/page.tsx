import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import { localeScopeForProfile } from "@/lib/i18n";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher";
import LocaleScope from "@/components/i18n/LocaleScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";

export default async function AttendancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes both queries to the caller's own club (or every club for hq).
  const [{ data: cohorts, error }, { data: members }] = await Promise.all([
    supabase
      .from("product_cohorts")
      .select("id, product_id, start_date, partner_id, products(name, sessions), partners(name)")
      .order("start_date", { ascending: false }),
    supabase.from("members").select("partner_id, product_id, start_date"),
  ]);

  const allMembers = members ?? [];
  const isHq = profile.role === "hq";
  const { scope, fallback } = scopeForProfile(profile);
  const localeScope = localeScopeForProfile(profile);

  const streams = (cohorts ?? []).map((c) => {
    const product = (c as { products?: { name: string; sessions: number | null } | null }).products;
    const partner = (c as { partners?: { name: string } | null }).partners;
    const count = allMembers.filter(
      (m) => m.partner_id === c.partner_id && m.product_id === c.product_id && m.start_date === c.start_date
    ).length;
    return {
      id: c.id,
      productName: product?.name ?? null,
      sessions: product?.sessions ?? 0,
      startDate: c.start_date,
      partnerName: partner?.name ?? "—",
      count,
    };
  });

  return (
    <AppShell
      profile={profile}
      title={<T k="navAttendance" />}
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
      ) : streams.length === 0 ? (
        <p className="text-sm text-muted">
          <T k="emptyNoStreams" />
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-background shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium"><T k="colCourse" /></th>
                  <th className="px-5 py-3 font-medium"><T k="colStartDate" /></th>
                  {isHq && <th className="px-5 py-3 font-medium"><T k="colClub" /></th>}
                  <th className="px-5 py-3 font-medium"><T k="colSessions" /></th>
                  <th className="px-5 py-3 font-medium"><T k="statMembers" /></th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">
                      {s.count > 0 ? (
                        <Link href={`/attendance/${s.id}`} className="hover:text-accent hover:underline">
                          {s.productName ?? <T k="courseDeleted" />}
                        </Link>
                      ) : (
                        s.productName ?? <T k="courseDeleted" />
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">{s.startDate}</td>
                    {isHq && <td className="px-5 py-3 text-muted">{s.partnerName}</td>}
                    <td className="px-5 py-3 text-muted">{s.sessions || "—"}</td>
                    <td className="px-5 py-3 text-muted">
                      {s.count === 0 ? <T k="noMembersCount" /> : s.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
