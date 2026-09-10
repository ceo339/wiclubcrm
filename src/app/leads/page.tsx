import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LeadsBoard from "@/components/leads/LeadsBoard";

export default async function LeadsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // RLS already scopes this to the caller's partner_id (or every partner
  // for hq) — no manual filtering needed here.
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*, partners(name)")
    .order("added_date", { ascending: false });

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
            Лиды
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        {error ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
            Не удалось загрузить лиды: {error.message}
          </p>
        ) : (
          <LeadsBoard
            initialLeads={(leads ?? []).map((l) => ({
              ...l,
              partner_name: (l as { partners?: { name: string } | null }).partners?.name ?? null,
            }))}
            isHq={profile.role === "hq"}
            canEdit={canEdit}
            products={products ?? []}
            cohorts={cohorts ?? []}
          />
        )}
      </main>
    </div>
  );
}
