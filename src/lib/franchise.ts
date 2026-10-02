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
export const FRANCHISE_STAGES: {
  id: FranchiseStageId;
  labelKey: string;
  won?: boolean;
  lost?: boolean;
  /** Round 44 (29 сен 2026 — "убери стадию встреча с людмилой пройдена",
   * "убери стадию обучение"): a retired stage stays in this array (so past
   * franchise_stage_history rows still render a real label instead of the
   * raw id — see franchiseStageLabel) but drops out of every *selectable*
   * surface — kanban columns, the stage dropdown, the funnel — via
   * VISIBLE_FRANCHISE_STAGES below. No candidate is currently sitting on
   * either retired stage (checked in production before removing), so this
   * is purely "stop offering it going forward", not a data migration. */
  retired?: boolean;
}[] = [
  { id: "application", labelKey: "fStageApplication" },
  { id: "in_progress", labelKey: "fStageInProgress" },
  { id: "interview_scheduled", labelKey: "fStageInterviewScheduled" },
  // Round 48 (30 сен 2026): "убери стадию собеседование проведено, как только
  // запись зума добавляется в карточку - переводи на стадию фин модель
  // отправлена" — retired; a Zoom recording now moves straight to
  // fin_model_sent (zoom webhook + setCandidateZoomUrl). No candidate sat on
  // this stage when it was retired (checked in production).
  { id: "interview_done", labelKey: "fStageInterviewDone", retired: true },
  { id: "fin_model_sent", labelKey: "fStageFinModelSent" },
  { id: "kristina_scheduled", labelKey: "fStageKristinaScheduled" },
  // Round 54 (2 окт 2026 — "встречу с кристиной проведена тоже убери"): no
  // candidate was sitting on this stage either (checked in production).
  { id: "kristina_done", labelKey: "fStageKristinaDone", retired: true },
  // Round 54 (2 окт 2026 — "убери стадию встреча с людмилой"): the other
  // half of this pair ("Встреча с Людмилой пройдена") was already retired
  // in round 44; no candidate was sitting on this one either (checked in
  // production before retiring).
  { id: "lyudmila_scheduled", labelKey: "fStageLyudmilaScheduled", retired: true },
  { id: "lyudmila_done", labelKey: "fStageLyudmilaDone", retired: true },
  { id: "contract_sent", labelKey: "fStageContractSent" },
  { id: "contract_signed", labelKey: "fStageContractSigned" },
  { id: "invoiced", labelKey: "fStageInvoiced" },
  { id: "invoice_paid", labelKey: "fStageInvoicePaid" },
  { id: "training", labelKey: "fStageTraining", retired: true },
  { id: "active", labelKey: "fStageActive", won: true },
  { id: "declined", labelKey: "fStageDeclined", lost: true },
  { id: "paused", labelKey: "fStagePaused", lost: true },
];

/** The stages a partner can actually pick going forward — every kanban
 * column, every option in the stage dropdown, and the funnel are built from
 * this, not FRANCHISE_STAGES directly (round 44 — see the `retired` note
 * above). */
export const VISIBLE_FRANCHISE_STAGES = FRANCHISE_STAGES.filter((s) => !s.retired);

export const isFranchiseStage = (id: string): id is FranchiseStageId =>
  FRANCHISE_STAGES.some((s) => s.id === id);

export const franchiseStageLabel = (id: string, locale: Locale) => {
  const key = FRANCHISE_STAGES.find((s) => s.id === id)?.labelKey;
  return key ? t(locale, key) : id;
};

/**
 * "Добавь вариант в отказе - игнор как причина отказа, тренер" (round 44) —
 * a preset reasons list for the "Отказ" prompt only (Пауза stays free text,
 * per Anastasiia's own scoping when asked). Dictionary keys, same convention
 * as leads' own DECLINE_REASONS (lib/leads.ts) — "fDeclineReasonOther"
 * reveals a free-text field in ReasonModal instead of being stored as-is.
 */
export const FRANCHISE_DECLINE_REASONS = ["fDeclineReasonIgnore", "fDeclineReasonTrainer", "fDeclineReasonOther"] as const;

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
  .filter((s) => !s.lost && !s.retired)
  .map((s) => s.id);

/**
 * "Убери и отображение самих колонок до стадии фин модель отправлена"
 * (Anastasiia, round 46) — which kanban COLUMNS the "Квалифицированные" tab
 * shows, as opposed to QUALIFYING_STAGES above (which decides who COUNTS as
 * qualified). Unlike QUALIFYING_STAGES this keeps declined/paused: a
 * candidate can be qualified by history (reached fin_model_sent once) while
 * currently sitting on "Отказ"/"Пауза", and those two are already the last
 * two entries in FRANCHISE_STAGES, so slicing from fin_model_sent onward
 * naturally includes them without needing to list them separately. */
export const QUALIFIED_TAB_STAGES = VISIBLE_FRANCHISE_STAGES.slice(
  VISIBLE_FRANCHISE_STAGES.findIndex((s) => s.id === "fin_model_sent")
);

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

// Round 46 briefly added a PARTNER_STAGES/computeStageReachedIds pair here
// to scope the new «Дашборд партнёров» block (NetworkSummaryPanel.tsx) to
// candidates who reached "Собеседование пройдено" or later. Anastasiia's
// very next round of feedback walked that back explicitly ("всего заявок
// на всех стадиях", "структура сети — учитывая все стадии"), so that block
// now runs on every candidate, same population as the rest of the
// franchise dashboard — removed rather than left unused.
