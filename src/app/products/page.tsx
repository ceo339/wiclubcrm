import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
import ProductsBoard from "@/components/products/ProductsBoard";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this to the caller's partner_id (or every partner for hq).
  const { data: products, error } = await supabase
    .from("products")
    .select("*, partners(name)")
    .order("name");

  const { data: cohorts } = await supabase
    .from("product_cohorts")
    .select("*")
    .order("start_date");

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Курсы
          </h1>
        </div>
        <CurrencySwitcher />
      </header>

      <main className="flex flex-1 flex-col p-6">
        {error ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
            Не удалось загрузить курсы: {error.message}
          </p>
        ) : (
          <ProductsBoard
            initialProducts={(products ?? []).map((p) => ({
              ...p,
              partner_name: (p as { partners?: { name: string } | null }).partners?.name ?? null,
            }))}
            initialCohorts={cohorts ?? []}
            isHq={profile.role === "hq"}
            canEdit={!!profile.partner_id}
          />
        )}
      </main>
    </div>
  );
}
