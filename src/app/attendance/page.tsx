import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";

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

  const streams = (cohorts ?? []).map((c) => {
    const product = (c as { products?: { name: string; sessions: number | null } | null }).products;
    const partner = (c as { partners?: { name: string } | null }).partners;
    const count = allMembers.filter(
      (m) => m.partner_id === c.partner_id && m.product_id === c.product_id && m.start_date === c.start_date
    ).length;
    return {
      id: c.id,
      productName: product?.name ?? "Курс удалён",
      sessions: product?.sessions ?? 0,
      startDate: c.start_date,
      partnerName: partner?.name ?? "—",
      count,
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Посещаемость
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        {error ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
            Не удалось загрузить потоки: {error.message}
          </p>
        ) : streams.length === 0 ? (
          <p className="text-sm text-muted">
            Пока нет ни одного потока курса — добавьте даты в разделе «Курсы», чтобы они появились
            здесь.
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Курс</th>
                    <th className="px-5 py-3 font-medium">Дата начала</th>
                    {isHq && <th className="px-5 py-3 font-medium">Клуб</th>}
                    <th className="px-5 py-3 font-medium">Занятий</th>
                    <th className="px-5 py-3 font-medium">Участниц</th>
                  </tr>
                </thead>
                <tbody>
                  {streams.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-medium text-foreground">
                        {s.count > 0 ? (
                          <Link href={`/attendance/${s.id}`} className="hover:text-accent hover:underline">
                            {s.productName}
                          </Link>
                        ) : (
                          s.productName
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted">{s.startDate}</td>
                      {isHq && <td className="px-5 py-3 text-muted">{s.partnerName}</td>}
                      <td className="px-5 py-3 text-muted">{s.sessions || "—"}</td>
                      <td className="px-5 py-3 text-muted">
                        {s.count === 0 ? "нет участниц" : s.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
