import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import CurrencySwitcher from "@/components/currency/CurrencySwitcher";
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
        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-4 p-8">
        {profile.role === "hq" && (
          <Link
            href="/dashboard"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground">Сводка по сети</div>
            <div className="mt-1 text-xs text-muted">
              Лиды, участницы и оплаты по всей сети и по каждому клубу
            </div>
          </Link>
        )}
        {profile.partner_id && (
          <Link
            href={`/dashboard/${profile.partner_id}`}
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground">Моя сводка</div>
            <div className="mt-1 text-xs text-muted">
              Выручка, роялти, конверсия и участницы по продуктам за период
            </div>
          </Link>
        )}
        <Link
          href="/leads"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground">Лиды</div>
          <div className="mt-1 text-xs text-muted">
            Воронка продаж — канбан и список
          </div>
        </Link>
        <Link
          href="/members"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground">Участницы</div>
          <div className="mt-1 text-xs text-muted">
            Список участниц, статус оплаты, посещаемость
          </div>
        </Link>
        <Link
          href="/attendance"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground">Посещаемость</div>
          <div className="mt-1 text-xs text-muted">
            Отметки за весь поток курса сразу, а не по одной участнице
          </div>
        </Link>
        <Link
          href="/products"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground">Курсы</div>
          <div className="mt-1 text-xs text-muted">
            Продукты клуба и даты потоков — для формы «Новый лид»
          </div>
        </Link>
        <Link
          href="/payments"
          className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
        >
          <div className="text-sm font-medium text-foreground">Оплаты</div>
          <div className="mt-1 text-xs text-muted">
            Учёт оплат по участницам — отдельно от суммы на карточке
          </div>
        </Link>
        {profile.role === "hq" && (
          <Link
            href="/partners"
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-accent"
          >
            <div className="text-sm font-medium text-foreground">Клубы сети</div>
            <div className="mt-1 text-xs text-muted">
              Добавить франчайзи — клуб и логин для входа
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}
