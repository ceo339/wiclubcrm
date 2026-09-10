import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PartnersBoard from "@/components/partners/PartnersBoard";

export default async function PartnersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hq") redirect("/");

  const supabase = await createClient();
  const { data: partners, error } = await supabase
    .from("partners")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink-2">
            ← WI Club CRM
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Клубы сети
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-6">
        {error ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
            Не удалось загрузить клубы: {error.message}
          </p>
        ) : (
          <PartnersBoard initialPartners={partners ?? []} />
        )}
      </main>
    </div>
  );
}
