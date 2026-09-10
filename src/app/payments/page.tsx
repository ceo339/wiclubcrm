import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import PaymentsBoard from "@/components/payments/PaymentsBoard";
import type { MemberOption } from "@/components/payments/types";

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*, partners(name), members(name), products(name)")
    .order("paid_date", { ascending: false });

  const canEdit = !!profile.partner_id;
  const stripeEnabled =
    canEdit && !!profile.partner_id && profile.partner_id === process.env.STRIPE_ENABLED_PARTNER_ID;
  const { data: members } = canEdit
    ? await supabase
        .from("members")
        .select("id, name, product_id, products(name, price)")
        .order("name")
    : { data: [] };

  const { scope, fallback } = scopeForProfile(profile);

  const memberOptions: MemberOption[] = (members ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    product_id: m.product_id,
    product_name: (m as { products?: { name: string } | null }).products?.name ?? null,
    product_price: (m as { products?: { price: number } | null }).products?.price ?? null,
  }));

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Оплаты</h1>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyScope scope={scope} fallback={fallback} />
          <CurrencySwitcher />
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        {error ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
            Не удалось загрузить оплаты: {error.message}
          </p>
        ) : (
          <PaymentsBoard
            initialPayments={(payments ?? []).map((p) => ({
              ...p,
              partner_name: (p as { partners?: { name: string } | null }).partners?.name ?? null,
              member_name: (p as { members?: { name: string } | null }).members?.name ?? null,
              product_name: (p as { products?: { name: string } | null }).products?.name ?? null,
            }))}
            memberOptions={memberOptions}
            canEdit={canEdit}
            stripeEnabled={stripeEnabled}
          />
        )}
      </main>
    </div>
  );
}
