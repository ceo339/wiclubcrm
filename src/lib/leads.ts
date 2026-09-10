// Shared constants for the Leads feature — mirrors the stage/source/decline
// vocabulary from the prototype (velora-final2.html) so behaviour and
// wording stay consistent between the demo and the real app.

export type StageId =
  | "new"
  | "progress"
  | "presented"
  | "invoiced"
  | "paid"
  | "declined";

export const STAGES: { id: StageId; label: string; prob: number; won?: boolean; lost?: boolean }[] = [
  { id: "new", label: "Новая заявка", prob: 10 },
  { id: "progress", label: "В работе", prob: 25 },
  { id: "presented", label: "Записалась", prob: 45 },
  { id: "invoiced", label: "Выставлен счет", prob: 70 },
  { id: "paid", label: "Оплата", prob: 100, won: true },
  { id: "declined", label: "Отказ", prob: 0, lost: true },
];

export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;

export const SOURCES = ["Instagram", "Referral", "Website", "Event"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  Instagram: "Instagram",
  Referral: "Рекомендация",
  Website: "Сайт",
  Event: "Мероприятие",
};

export const DECLINE_REASONS = [
  { id: "declineNoMoney", label: "Нет денег" },
  { id: "declineExpensive", label: "Дорого" },
  { id: "declineNoTime", label: "Нет времени" },
  { id: "declineNotRelevant", label: "Не актуально" },
  { id: "declineNotInCity", label: "Не в городе" },
  { id: "declineOther", label: "Другое" },
];

export const declineReasonLabel = (id: string | null) =>
  DECLINE_REASONS.find((r) => r.id === id)?.label ?? id ?? "";

// Country list + default city, mirrors the prototype's COUNTRIES array
// (velora-final2.html) so the Add Lead form behaves the same way.
export const COUNTRIES: { name: string; city?: string }[] = [
  { name: "Sweden" },
  { name: "USA" },
  { name: "United Kingdom" },
  { name: "Germany" },
  { name: "France" },
  { name: "Italy" },
  { name: "Latvia" },
  { name: "Denmark" },
  { name: "Ukraine" },
  { name: "Georgia", city: "Batumi" },
  { name: "Bulgaria", city: "Sofia" },
];

// Generic membership/course plans offered when a lead isn't tied to a real
// product yet — mirrors the prototype's "Интересует" fallback dropdown.
export const GENERIC_PLANS: { id: string; label: string; price: number }[] = [
  { id: "plAnnual", label: "Годовое членство", price: 1200 },
  { id: "plMonthly", label: "Ежемесячное членство", price: 520 },
  { id: "plCourse", label: "Курс «Женское лидерство»", price: 390 },
  { id: "plCoaching", label: "Личный коучинг", price: 850 },
];

export const genericPlanLabel = (id: string | null) => {
  const plan = GENERIC_PLANS.find((p) => p.id === id);
  return plan ? `${plan.label} · $${plan.price}` : id ?? "";
};
