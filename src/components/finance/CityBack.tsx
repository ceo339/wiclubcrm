"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import { VIEW_SCOPE_COOKIE } from "@/lib/role";

/** Для hq/viewer внутри финансов клуба: вернуться к сводке по всем городам (то же, что «Все города» в шапке). */
export default function CityBack() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${VIEW_SCOPE_COOKIE}=all; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
      className="mb-3 text-sm text-ink-2 hover:text-accent-strong hover:underline"
    >
      ← {t("cityScopeAll")}
    </button>
  );
}
