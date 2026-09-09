import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { signOut } from "./login/actions";

const ROLE_LABELS: Record<string, string> = {
  partner: "Партнёр",
  staff: "Сотрудник клуба",
  hq: "HQ (головной офис)",
};

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            WI Club CRM
          </h1>
          <p className="text-sm text-muted">
            {profile.partner_name ?? "Без привязки к клубу"} ·{" "}
            {ROLE_LABELS[profile.role] ?? profile.role}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            Выйти
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-sm text-muted">
            Аккаунт подключён и готов к работе. Раздел «Лиды» на реальных
            данных появится следующим шагом.
          </p>
        </div>
      </main>
    </div>
  );
}
