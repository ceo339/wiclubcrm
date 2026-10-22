"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { nextCallAt, tzLabel, type CallInfo } from "../types";

/**
 * Ближайший созвон: разовый перенос (next_call_at) или регулярный день и время
 * в поясе куратора. Время показывается в поясе того, кто смотрит, а второй строкой
 * у другой стороны (партнеру у куратора, куратору у партнера).
 * Считаем только в браузере: на сервере свой часовой пояс и было бы не то время.
 */
export default function CallTime({ call, isPartner, big = false }: { call: CallInfo; isPartner: boolean; big?: boolean }) {
  const { t } = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(id);
  }, []);
  if (!now) return <b className={big ? "text-lg" : ""}>…</b>;
  const at = nextCallAt(call, now);
  if (!at) return <b className={big ? "text-lg" : ""}>—</b>;
  const fmt = (tz?: string) =>
    at.toLocaleString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
  const time = (tz: string) => at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const other = isPartner ? call.call_tz : call.partner_tz;
  return (
    <div>
      <b className={big ? "text-lg" : ""}>{fmt()}</b>
      {other && other !== mine && (
        <div className="text-xs text-muted">
          {t(isPartner ? "onbCallAtCurator" : "onbCallAtPartner")}: {time(other)} · {tzLabel(other)}
        </div>
      )}
      {call.call_weekday && call.call_time && <div className="text-xs text-muted">{t("onbCallWeekly")}</div>}
    </div>
  );
}
