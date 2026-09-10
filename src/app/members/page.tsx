import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scopeForProfile } from "@/lib/currency";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import CurrencyScope from "@/components/currency/CurrencyScope";
import MembersBoard from "@/components/members/MembersBoard";

export default async function MembersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  const { data: members, error } = await supabase
    .from("members")
    .select("*, partners(name), products(name, price, sessions)")
    .order("created_at", { ascending: false });

  const { scope, fallback } = scopeForProfile(profile);

  const canEdit = !!profile.partner_id;
  const [{ data: products }, { data: cohorts }] = canEdit
    ? await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("product_cohorts").select("*").order("start_date"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Участницы
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
            Не удалось загрузить участниц: {error.message}
          </p>
        ) : (
          <MembersBoard
            initialMembers={(members ?? []).map((m) => ({
              ...m,
              partner_name: (m as { partners?: { name: string } | null }).partners?.name ?? null,
              product_name:
                (m as { products?: { name: string } | null }).products?.name ?? null,
              product_price:
                (m as { products?: { price: number } | null }).products?.price ?? null,
              product_sessions:
                (m as { products?: { sessions: number | null } | null }).products?.sessions ??
                null,
            }))}
            products={products ?? []}
            cohorts={cohorts ?? []}
            isHq={profile.role === "hq"}
            canEdit={canEdit}
          />
        )}
      </main>
    </div>
  );
}
