"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import { VIEW_MODE_COOKIE, VIEW_SCOPE_COOKIE } from "@/lib/role";

export type ViewMode = "franchise" | "clubs";

/**
 * Round 18 (15 сен 2026): "Можно ли в главном кабинете сделать на главной
 * переключение по городам + смотреть все города". Round 40 (28 сен 2026)
 * briefly folded "Франчайзи" into the same city dropdown, alongside a
 * `?scope=franchise` query param on Главная — that reproducibly failed in
 * production (address bar updated, page never did), so it became a
 * separate `<Link>` button to /franchise instead, with the franchise
 * dashboard itself moved to live there as its own tab.
 *
 * Round 42 (28 сен 2026): "кнопки крупнее... же выбор показывать клубы или
 * франчайзи... по умолчанию главная это франчайзи... если выбрана
 * франчайзи то на главной... лидов, участниц, курсов, посещаемости, оплат,
 * когортного анализа, имейлов НЕТ... все появляется только когда
 * выбираются города". This is now a genuine top-level scope switch, not a
 * link to a page: a plain cookie (VIEW_MODE_COOKIE) read server-side by
 * every page that renders AppShell, deciding both what Главная shows (see
 * src/app/page.tsx) and which nav items even appear (see AppShell's
 * navItemsForProfile — a page you can't see in the nav can still be
 * reached by URL, there's just nothing pointing you to it). The
 * franchise-candidate PIPELINE (kanban) still lives at its own /franchise
 * route, reached via its own nav item — this toggle is only about Главная
 * and the rest of the club-scoped nav.
 *
 * The city dropdown only makes sense once "Клубы" is picked — a franchise
 * candidate isn't scoped to any one city — so it's hidden entirely under
 * "Франчайзи". Both controls just set a cookie and reload, same
 * plain-cookie-plus-full-reload approach as the original round 18
 * switcher (no client-side router involved, after round 40's saga of a
 * same-route query-param update silently not re-rendering in production).
 */
export default function CityScopeSwitcher({
  clubs,
  activeClubId,
  viewMode,
}: {
  clubs: { id: string; name: string }[];
  activeClubId: string | null;
  viewMode: ViewMode;
}) {
  const t = useT();

  function handleModeChange(mode: ViewMode) {
    if (mode === viewMode) return;
    document.cookie = `${VIEW_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  function handleCityChange(value: string) {
    document.cookie = `${VIEW_SCOPE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border-strong bg-surface-2 p-1">
        {(["franchise", "clubs"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleModeChange(mode)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              viewMode === mode
                ? "bg-foreground text-background shadow-card"
                : "text-ink-2 hover:bg-surface-3"
            }`}
          >
            {mode === "franchise" ? t("navFranchise") : t("scopeClubs")}
          </button>
        ))}
      </div>
      {viewMode === "clubs" && clubs.length > 0 && (
        <select
          value={activeClubId ?? "all"}
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
