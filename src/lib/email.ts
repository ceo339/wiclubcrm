// Shared vocabulary + honest, on-the-fly math for the Email campaigns
// feature. Nothing here is precomputed or cached — campaign "stats" are
// always derived from the real per-recipient rows (same philosophy as
// dashboard.ts's core metrics), so a percentage on screen can never drift
// from what Resend's webhook actually reported.

import type { Tables } from "@/types/database";

export type CampaignAudience = "members" | "leads_active" | "leads_all";

export const AUDIENCES: { id: CampaignAudience; labelKey: string }[] = [
  { id: "members", labelKey: "audienceMembers" },
  { id: "leads_active", labelKey: "audienceLeadsActive" },
  { id: "leads_all", labelKey: "audienceLeadsAll" },
];

export function isAudience(value: string | null | undefined): value is CampaignAudience {
  return value === "members" || value === "leads_active" || value === "leads_all";
}

export type RecipientStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed";

/**
 * A recipient's `status` column holds a single current state, same
 * convention as leads.stage / members.status — later webhook events move
 * it forward, they never overwrite it with an earlier one. bounced/
 * complained/failed are terminal outcomes and always win regardless of
 * rank (see the webhook route).
 */
const STATUS_RANK: Record<RecipientStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
};

export function isForwardStatusMove(current: string, next: RecipientStatus): boolean {
  const currentRank = STATUS_RANK[current as RecipientStatus] ?? 0;
  const nextRank = STATUS_RANK[next];
  if (nextRank === 5) return true; // terminal outcomes always apply
  return nextRank > currentRank;
}

export type CampaignRow = Tables<"email_campaigns">;
export type RecipientRow = Tables<"email_campaign_recipients">;

export type CampaignStats = {
  recipientsCount: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  failedCount: number;
  /** null when nothing was actually sent yet — never a fabricated 0%. */
  openedPct: number | null;
  clickedPct: number | null;
};

/**
 * Computed straight from the recipient rows every time a page renders —
 * see the module doc comment. "Opened" counts anyone whose latest known
 * status is opened *or* clicked (a click necessarily followed an open,
 * even though the status column only remembers the latest one).
 */
export function computeCampaignStats(recipients: Pick<RecipientRow, "status">[]): CampaignStats {
  const recipientsCount = recipients.length;
  const sentCount = recipients.filter((r) => r.status !== "queued" && r.status !== "failed").length;
  const openedCount = recipients.filter((r) => r.status === "opened" || r.status === "clicked").length;
  const clickedCount = recipients.filter((r) => r.status === "clicked").length;
  const bouncedCount = recipients.filter((r) => r.status === "bounced" || r.status === "complained").length;
  const failedCount = recipients.filter((r) => r.status === "failed").length;

  return {
    recipientsCount,
    sentCount,
    openedCount,
    clickedCount,
    bouncedCount,
    failedCount,
    openedPct: sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : null,
    clickedPct: sentCount > 0 ? Math.round((clickedCount / sentCount) * 100) : null,
  };
}

/** Turns the compose textarea's plain text into minimal HTML — a blank
 * line starts a new paragraph, a single newline becomes a line break.
 * Escapes the 5 HTML-significant characters first so nothing a user types
 * can inject markup into their own email. */
export function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
}
