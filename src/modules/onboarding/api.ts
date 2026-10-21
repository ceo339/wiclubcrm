/**
 * Единственная точка входа в модуль «Онбординг» для остальной CRM.
 * Другие разделы не читают таблицы схемы `onboarding` напрямую.
 *
 * Клиентский код (AppShell) импортирует только `access.ts` (без зависимостей);
 * этот файл для серверного кода.
 */
export { canViewOnboarding, canMarkOnboarding, canManageOnboarding, showOnboardingNav } from "./access";
export { loadOverview as loadOnboardingOverview, loadClubCandidates as loadOnboardingClubCandidates } from "./server/load";
/** Для «+ Клуб»: создать онбординг уже привязанным к новому клубу. Только после проверки роли hq. */
export { createOnboarding as startOnboardingForClub } from "./server/start";
/** Для «+ Клуб»: папка партнера на Google Диске (если робот Google настроен). */
export { createPartnerDriveFolder } from "./server/folder";
export { isDriveConfigured as isOnboardingDriveConfigured } from "./server/drive";
export type { OnboardingCard, OnbStatus, ClubCandidate as OnboardingClubCandidate } from "./types";
