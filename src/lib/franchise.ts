// Shared constants for the «Франчайзи» (franchise-candidate) feature —
// round 38's data model. Same architecture as lib/leads.ts: stage ids are a
// plain, DB-unconstrained `text` column (franchise_candidates.stage), with
// validity enforced only here in app code via the STAGES array — labels are
// dictionary keys (src/lib/i18n.ts), not literal Russian text.
//
// Unlike leads' 6-stage funnel, this pipeline needs a *date per stage*
// (Anastasiia, 25 сен 2026: "Интервью назначено (с датой) → Интервью
// проведено (с датой) → ..."). Rather than bolting 15 separate date columns
// onto franchise_candidates, each stage transition is instead logged as its
// own row in franchise_stage_history (candidate_id, stage, occurred_at) —
// the candidate's current stage's date is just that table's latest row for
// the stage it's currently on, and the full timeline (every stage it's ever
// passed through, with a real date each) falls out of the same table for
// free. See src/app/franchise/actions.ts (updateCandidateStage) for where
// that history row gets written.

import { t, type Locale } from "@/lib/i18n";

export type FranchiseStageId =
  | "application"
  | "in_progress"
  | "interview_scheduled"
  | "interview_done"
  | "fin_model_sent"
  | "kristina_scheduled"
  | "kristina_done"
  | "lyudmila_scheduled"
  | "lyudmila_done"
  | "contract_sent"
  | "contract_signed"
  | "invoiced"
  | "invoice_paid"
  | "training"
  | "active"
  | "declined"
  | "paused";

/**
 * Verbatim funnel from Anastasiia's message (25 сен 2026):
 * "Заявка → В работе → Интервью назначено (с датой) → Интервью проведено
 * (с датой) → Фин модель отправлена (с датой) → Интервью с Кристиной
 * назначено (с датой) → Интервью с Кристиной проведено (с датой) →
 * Интервью с Людмилой назначено (с датой) → Интервью с Людмилой проведено
 * (с датой) → Договор отправлен (с датой) → Договор подписан (с датой) →
 * Выставлен счет (с датой) → Счет оплачен (с датой) → Обучение (с датой) →
 * Активен (с датой), и отдельно тупиковый исхода — Отказ/Пауза (с причиной
 * отказала)". 15 working stages + 2 separate terminal outcomes (a paused
 * candidate isn't "lost" the way a declined one is, so they're kept as two
 * distinct stages rather than one "Отказ/Пауза" bucket — both still use the
 * same free-text `reject_reason` field).
 */
export const FRANCHISE_STAGES: { id: FranchiseStageId; labelKey: string; won?: boolean; lost?: boolean }[] = [
  { id: "application", labelKey: "fStageApplication" },
  { id: "in_progress", labelKey: "fStageInProgress" },
  { id: "interview_scheduled", labelKey: "fStageInterviewScheduled" },
  { id: "interview_done", labelKey: "fStageInterviewDone" },
  { id: "fin_model_sent", labelKey: "fStageFinModelSent" },
  { id: "kristina_scheduled", labelKey: "fStageKristinaScheduled" },
  { id: "kristina_done", labelKey: "fStageKristinaDone" },
  { id: "lyudmila_scheduled", labelKey: "fStageLyudmilaScheduled" },
  { id: "lyudmila_done", labelKey: "fStageLyudmilaDone" },
  { id: "contract_sent", labelKey: "fStageContractSent" },
  { id: "contract_signed", labelKey: "fStageContractSigned" },
  { id: "invoiced", labelKey: "fStageInvoiced" },
  { id: "invoice_paid", labelKey: "fStageInvoicePaid" },
  { id: "training", labelKey: "fStageTraining" },
  { id: "active", labelKey: "fStageActive", won: true },
  { id: "declined", labelKey: "fStageDeclined", lost: true },
  { id: "paused", labelKey: "fStagePaused", lost: true },
];

export const isFranchiseStage = (id: string): id is FranchiseStageId =>
  FRANCHISE_STAGES.some((s) => s.id === id);

export const franchiseStageLabel = (id: string, locale: Locale) => {
  const key = FRANCHISE_STAGES.find((s) => s.id === id)?.labelKey;
  return key ? t(locale, key) : id;
};

/** Stages that need a reason when a card lands on them (Отказ/Пауза) —
 * shared by the kanban drop handler and the detail modal's stage dropdown,
 * so both trigger the same reason prompt instead of silently losing why a
 * candidate was declined/paused. */
export const FRANCHISE_TERMINAL_STAGES: FranchiseStageId[] = ["declined", "paused"];

/**
 * "Квалифицированные" (round 40, 28 сен 2026) — "туда переносить всех, кто
 * на стадии Фин. модель отправлена или прошел эту стадию". Every working
 * stage from fin_model_sent through active (declined/paused excluded here
 * on purpose — a candidate who ever REACHED one of these stages still
 * counts per Anastasiia's decision, but that's checked separately against
 * franchise_stage_history, since her CURRENT stage may by then say
 * declined/paused).
 */
export const QUALIFYING_STAGES: FranchiseStageId[] = FRANCHISE_STAGES
  .slice(FRANCHISE_STAGES.findIndex((s) => s.id === "fin_model_sent"))
  .filter((s) => !s.lost)
  .map((s) => s.id);

/**
 * Shared by franchise/page.tsx's kanban ("Квалифицированные" tab) and the
 * Главная franchise dashboard (round 42) so the two never compute this
 * differently. Union of (a) candidates whose franchise_stage_history ever
 * logged one of QUALIFYING_STAGES, and (b) candidates currently sitting on
 * one — see QUALIFYING_STAGES above for why history matters here and not
 * just the current stage.
 */
export function computeQualifiedIds(
  candidates: { id: string; stage: string }[],
  qualifyingHistoryCandidateIds: string[]
): string[] {
  return Array.from(
    new Set([
      ...qualifyingHistoryCandidateIds,
      ...candidates.filter((c) => QUALIFYING_STAGES.includes(c.stage as FranchiseStageId)).map((c) => c.id),
    ])
  );
}
