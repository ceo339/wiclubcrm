"use client";

import { useRouter } from "next/navigation";
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
 */
export default function CityScopeSwitcher({
  clubs,
  activeClubId,
}: {
  clubs: { id: string; name: string }[];
  activeClubId: string | null;
}) {
  const router = useRouter();
  const t = useT();

  function handleChange(value: string) {
    document.cookie = `${VIEW_SCOPE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  if (clubs.length === 0) return null;

  return (
    <select
      value={activeClubId ?? "all"}
      onChange={(e) => handleChange(e.target.value)}
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
  );
}
