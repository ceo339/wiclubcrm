"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n/LocaleProvider";
import { VIEW_SCOPE_COOKIE } from "@/lib/role";

/**
 * "Можно ли в главном кабинете сделать на главной переключение по городам
 * + смотреть все города, чтоб видеть во всех вкладках данные по города
 * партнеров?" (Anastasiia, 15 сен 2026) — Round 18. Shown only to hq/viewer
 * accounts (see AppShell), narrows every tab — Главная, Лиды, Участницы,
 * Оплаты, Контакты, Курсы, Посещаемость — down to one club at a time.
 *
 * The chosen club is just a display preference, not a security boundary
 * (RLS already decides what this account may see), so it's a plain cookie
 * set directly from the browser — no server round trip needed to change
 * it, just a refresh so every Server Component re-reads the new value.
 *
 * Round 40 (28 сен 2026) briefly folded "Франчайзи" into this same
 * dropdown as an extra option, alongside a `?scope=franchise` query param
 * on Главная to render a franchise dashboard in place. That combination
 * reproducibly failed in production — picking it updated the address bar
 * but never the page, in a private window, on a fresh full navigation,
 * even after ruling out every caching layer we could reach. Rather than
 * keep chasing an unexplained bug in that one specific code path,
 * Anastasiia asked for the simpler shape directly ("франчайзи отдельная
 * кнопка и по городам выпадающий список"): a plain `<Link>` to the
 * already-solid /franchise route (unchanged since round 38) instead of a
 * query param on "/", and a city `<select>` that only ever deals with
 * actual clubs. The franchise dashboard itself now lives at /franchise as
 * its own tab (see FranchiseBoard.tsx) instead of trying to appear on
 * Главная.
 */
export const FRANCHISE_SCOPE_VALUE = "franchise";

export default function CityScopeSwitcher({
  clubs,
  activeClubId,
}: {
  clubs: { id: string; name: string }[];
  activeClubId: string | null;
}) {
  const pathname = usePathname();
  const t = useT();
  const onFranchise = activeClubId === FRANCHISE_SCOPE_VALUE;

  function handleCityChange(value: string) {
    document.cookie = `${VIEW_SCOPE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    if (pathname === "/franchise") {
      // Coming from the franchise route, picking a real club/"Все города"
      // means going back to Главная with that club now selected — staying
      // on /franchise wouldn't reflect the choice at all.
      window.location.href = "/";
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/franchise"
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          onFranchise
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-ink-2 hover:bg-surface-2"
        }`}
      >
        {t("navFranchise")}
      </Link>
      {clubs.length > 0 && (
        <select
          value={onFranchise ? "all" : activeClubId ?? "all"}
          onChange={(e) => handleCityChange(e.target.value)}
          aria-label={t("cityScopeLabel")}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
        >
          <option value="all">{t("cityScopeAll")}</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
