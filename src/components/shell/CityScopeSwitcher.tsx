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
 *
 * Round 38 follow-up (28 сен 2026 — "на главной нужно выбирать клубы и
 * франчайзи отображать"): rather than teaching every club-scoped page
 * (Лиды, Участницы, Оплаты…) what a "Франчайзи" scope would even mean, this
 * adds it here purely as a quick-nav entry — picking it just routes
 * straight to /franchise instead of writing the scope cookie, so every
 * other tab's own club-filtering logic is untouched. /franchise itself
 * renders this same switcher (see its page.tsx) with FRANCHISE_SCOPE_VALUE
 * passed as activeClubId, so the dropdown correctly shows "Франчайзи"
 * selected while you're actually there.
 */
export const FRANCHISE_SCOPE_VALUE = "franchise";

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
    if (value === FRANCHISE_SCOPE_VALUE) {
      router.push("/franchise");
      return;
    }
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
      <option value={FRANCHISE_SCOPE_VALUE}>{t("navFranchise")}</option>
    </select>
  );
}
