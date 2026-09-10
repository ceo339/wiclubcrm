import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currencyForCountry } from "@/lib/currency";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import GroupAttendanceBoard from "@/components/attendance/GroupAttendanceBoard";

export default async function CohortAttendancePage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { cohortId } = await params;
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("product_cohorts")
    .select("id, partner_id, product_id, start_date, products(name, sessions), partners(name, country)")
    .eq("id", cohortId)
    .single();
  if (!cohort) notFound();

  // A partner/staff account can only ever open its own club's stream — RLS
  // would return no members for someone else's anyway, but redirecting is
  // more honest than showing an empty grid for the wrong URL.
  if (profile.role !== "hq" && profile.partner_id !== cohort.partner_id) {
    redirect("/attendance");
  }

  const product = (cohort as { products?: { name: string; sessions: number | null } | null }).products;
  const partner = (cohort as { partners?: { name: string; country: string | null } | null }).partners;

  const { data: members } = await supabase
    .from("members")
    .select("id, name, attended")
    .eq("partner_id", cohort.partner_id)
    .eq("product_id", cohort.product_id)
    .eq("start_date", cohort.start_date)
    .order("name");

  const canEdit = !!profile.partner_id;

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/attendance" className="text-sm text-muted hover:text-ink-2">
            ← Посещаемость
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {product?.name ?? "Курс удалён"}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {profile.role === "hq" && partner?.name ? `${partner.name} · ` : ""}
            начало {cohort.start_date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope
            scope={`club:${cohort.partner_id}`}
            fallback={currencyForCountry(partner?.country)}
          />
          <CurrencySwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        <div className="rounded-xl border border-border bg-background">
          <GroupAttendanceBoard
            members={members ?? []}
            sessions={product?.sessions ?? 0}
            canEdit={canEdit}
          />
        </div>
      </main>
    </div>
  );
}
