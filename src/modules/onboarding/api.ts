/**
 * Единственная точка входа в модуль «Онбординг» для остальной CRM.
 * Другие разделы не читают таблицы схемы `onboarding` напрямую.
 *
 * Клиентский код (AppShell) импортирует только `access.ts` (без зависимостей);
 * этот файл для серверного кода.
 */
export { canViewOnboarding, canMarkOnboarding, canManageOnboarding, showOnboardingNav } from "./access";
export { loadOverview as loadOnboardingOverview } from "./server/load";
export type { OnboardingCard, OnbStatus } from "./types";
