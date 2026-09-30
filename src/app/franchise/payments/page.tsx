import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isNetworkRole, getViewMode } from "@/lib/viewScope";
import T from "@/components/i18n/T";
import AppShell from "@/components/shell/AppShell";
import { canBillFranchise, canEditFranchise, canViewFranchise } from "@/lib/franchiseAccess";
import FranchisePaymentsBoard from "@/components/franchise/payments/FranchisePaymentsBoard";

/** «Оплаты франчайзи» (round 48) — HQ's receivables from franchisees:
 * паушальный взнос, royalties, training/extra invoices. Same access gate as
 * /franchise itself. */
export default async function FranchisePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Round 49: the finance director (franchise_access = finance) bills here
  // too; only HQ/МПП may edit the pipeline card itself.
  const canBill = canBillFranchise(profile);
  if (!canViewFranchise(profile)) redirect("/");
  const { status } = await searchParams;

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
        <FranchisePaymentsBoard
          payments={payments ?? []}
          candidates={candidates ?? []}
          canEdit={canBill}
          canEditCandidate={canEditFranchise(profile)}
          initialStatus={status === "overdue" ? "overdue" : "all"}
        />
      )}
    </AppShell>
  );
}
