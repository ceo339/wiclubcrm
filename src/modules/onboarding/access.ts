/**
 * Кто видит и кто правит раздел «Онбординг». Без зависимостей (ни next/headers,
 * ни supabase), поэтому работает и в AppShell на клиенте, и на сервере.
 *
 * - hq: видит всех партнеров, правит все (план, звонки, задачи, шаблон, старт онбординга).
 * - partner: видит только свой онбординг; отмечает статусы пунктов и свои задачи.
 * - viewer: видит всех, ничего не правит.
 */

export const ONB_VIEW_ROLES = ["hq", "partner", "viewer"] as const;

export function canViewOnboarding(role: string): boolean {
  return (ONB_VIEW_ROLES as readonly string[]).includes(role);
}

/** Может отмечать статусы пунктов и выполнение задач (партнер только у себя). */
export function canMarkOnboarding(role: string): boolean {
  return role === "hq" || role === "partner";
}

/** Полное управление: звонки, задачи, пункты плана, шаблон, старт и открытие. */
export function canManageOnboarding(role: string): boolean {
  return role === "hq";
}

/**
 * Показывать ли пункт меню. У hq/viewer раздел живет в режиме «Франчайзи»
 * (рядом с воронкой и оплатами), у партнера переключателя режимов нет.
 */
export function showOnboardingNav(role: string, viewMode: "franchise" | "clubs"): boolean {
  if (!canViewOnboarding(role)) return false;
  if (role === "hq" || role === "viewer") return viewMode === "franchise";
  return true;
}
