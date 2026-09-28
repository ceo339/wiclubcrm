"use client";

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
 * Round 38 follow-up (28 сен 2026 — "на главной нужно выбирать клубы и
 * франчайзи отображать"): rather than teaching every club-scoped page
 * (Лиды, Участницы, Оплаты…) what a "Франчайзи" scope would even mean, this
 * adds it here purely as a quick-nav entry — picking it just routes
 * straight to /franchise instead of writing the scope cookie, so every
 * other tab's own club-filtering logic is untouched. /franchise itself
 * renders this same switcher (see its page.tsx) with FRANCHISE_SCOPE_VALUE
 * passed as activeClubId, so the dropdown correctly shows "Франчайзи"
 * selected while you're actually there.
 *
 * Round 40 follow-up (28 сен 2026 — "Главную сделать с той же аналитикой,
 * что и для клубов и так же выбор показывать клубы или франчайзи"): on the
 * Главная page specifically, picking "Франчайзи" now stays right there and
 * renders a franchise dashboard (via a `?scope=franchise` query param, see
 * app/page.tsx) instead of navigating away to the /franchise kanban — every
 * OTHER page still just routes to /franchise as before, since none of them
 * know what a franchise scope would mean. Deliberately a query param, not
 * the VIEW_SCOPE_COOKIE: that cookie is read as a literal partner_id by
 * every club-scoped page's own query (getViewScopePartnerId), so writing
 * "franchise" into it would silently break Лиды/Участницы/Оплаты/Контакты
 * the moment you left Главная with it still set.
 *
 * Round 40 bugfix (28 сен 2026 — Anastasiia: "я переключаю, но ничего не
 * происходит", then confirmed the URL bar did gain `?scope=franchise`
 * while the dashboard on screen stayed the club one): a same-route,
 * query-only `router.push()` fired from outside a `<Link>` is the one
 * navigation shape nothing else in this app had ever done before this
 * switcher — every other `router.push` call here either goes to a
 * different route (`/franchise`) or is a plain `router.refresh()`. That
 * turned out to be the one case that silently failed to re-render in
 * production even though it did update the address bar. Switching to a
 * full `window.location` navigation sidesteps the client router
 * entirely, so the server always re-runs page.tsx with the new
 * searchParams — a little less "instant" than a soft transition, but this
 * toggle is flipped rarely enough that correctness matters more here.
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
  const onHome = pathname === "/";

  function handleChange(value: string) {
    if (value === FRANCHISE_SCOPE_VALUE) {
      window.location.href = onHome ? "/?scope=franchise" : "/franchise";
      return;
    }
    document.cookie = `${VIEW_SCOPE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    // On Главная, picking an actual club/"Все города" while a leftover
    // ?scope=franchise is still in the URL must drop it — otherwise the
    // page would keep showing the franchise dashboard no matter which club
    // the cookie now points to. A full navigation to the bare path clears it.
    if (onHome) window.location.href = "/";
    else window.location.reload();
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
