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

/** Every value email_campaigns.audience can actually hold — the three
 * broadcast audiences above, plus "single": a one-off email sent from a
 * lead/member's own card (see sendDirectEmail in app/email/actions.ts).
 * "single" is deliberately not offered in the compose picker (AUDIENCES
 * above) since it only ever comes from that one entity's own card, but it
 * still needs a label wherever campaigns are listed. */
const AUDIENCE_LABEL_KEYS: Record<string, string> = {
  members: "audienceMembers",
  leads_active: "audienceLeadsActive",
  leads_all: "audienceLeadsAll",
  single: "audienceSingle",
};

export function audienceLabelKey(audience: string): string {
  return AUDIENCE_LABEL_KEYS[audience] ?? audience;
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

const RECIPIENT_STATUS_LABEL_KEYS: Record<RecipientStatus, string> = {
  queued: "recipientStatusQueued",
  sent: "recipientStatusSent",
  delivered: "recipientStatusDelivered",
  opened: "recipientStatusOpened",
  clicked: "recipientStatusClicked",
  bounced: "recipientStatusBounced",
  complained: "recipientStatusComplained",
  failed: "recipientStatusFailed",
};

export function recipientStatusLabelKey(status: string): string {
  return RECIPIENT_STATUS_LABEL_KEYS[status as RecipientStatus] ?? status;
}

/** Same good/warn/critical/mute vocabulary as statusPillClasses in
 * members.ts/payments.ts — opened/clicked is the best real outcome (dark),
 * queued/sent is still in flight (warn), bounced/complained/failed is a
 * real negative outcome (accent), delivered sits neutrally between. */
export function recipientStatusPillClasses(status: string): string {
  switch (status) {
    case "opened":
    case "clicked":
      return "bg-surface-3 text-ink-2";
    case "bounced":
    case "complained":
    case "failed":
      return "bg-accent-soft text-accent-strong";
    case "delivered":
      return "bg-surface-2 text-muted";
    case "sent":
    case "queued":
    default:
      return "bg-warn-soft text-warn";
  }
}

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
