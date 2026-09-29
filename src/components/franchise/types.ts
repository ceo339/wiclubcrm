import type { Tables } from "@/types/database";

/** `latest_comment` (round 44, 29 сен 2026 — "добавь отображение
 * комментария последнего в канбане") — most recent note left on this
 * candidate's card, if any; see franchise/page.tsx's own query. Not the
 * whole thread (that's still lazy-loaded only when the card opens via
 * getCandidateDetail), just enough for the board to show at a glance —
 * same convention as leads' own `latest_comment` (components/leads/types.ts).
 * Optional (unlike leads') — the franchise candidates fetched for Главная
 * and the Контакты tab never compute it, only /franchise's own kanban does. */
export type FranchiseCandidate = Tables<"franchise_candidates"> & {
  latest_comment?: string | null;
};
