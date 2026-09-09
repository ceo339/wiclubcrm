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
