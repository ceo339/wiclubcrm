import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isNetworkRole, getViewMode } from "@/lib/viewScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import FranchisePaymentsBoard from "@/components/franchise/payments/FranchisePaymentsBoard";

/** «Оплаты франчайзи» (round 48) — HQ's receivables from franchisees:
 * паушальный взнос, royalties, training/extra invoices. Same access gate as
 * /franchise itself. */
export default async function FranchisePaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const canEdit = profile.role === "hq" || profile.franchise_access === "edit";
  const canView = canEdit || profile.franchise_access === "view";
  if (!canView) redirect("/");

  const supabase = await createClient();
  const [{ data: payments, error }, { data: candidates }] = await Promise.all([
    supabase.from("franchise_payments").select("*").order("invoice_date", { ascending: false }),
    supabase.from("franchise_candidates").select("*").order("name"),
  ]);

  const isNetwork = isNetworkRole(profile.role);
  const [{ data: switcherClubs }, viewMode] = await Promise.all([
    isNetwork ? supabase.from("partners").select("id, name").order("name") : Promise.resolve({ data: [] }),
    getViewMode(profile),
  ]);

  return (
    <AppShell
      profile={profile}
      title={<T k="navFranchisePayments" />}
      clubs={switcherClubs ?? []}
      activeClubId={null}
      viewMode={viewMode}
    >
      {error ? (
        <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">{error.message}</p>
      ) : (
        <FranchisePaymentsBoard payments={payments ?? []} candidates={candidates ?? []} canEdit={canEdit} />
      )}
    </AppShell>
  );
}
