import { formatDateRu } from "@/lib/dskMatch";
import { logIntegrationEvent } from "@/lib/integrations/franchise";
import type { Db } from "@/lib/server/leadEnrollment";

/**
 * Round 63 — Telegram bot: «новый лид» → the club's chat, so the partner opens the
 * CRM and works the lead straight away.
 *   • TELEGRAM_BOT_TOKEN (Vercel env, from @BotFather) — never stored in the database;
 *   • partners.telegram_chat_id — where each club's notifications go (a group the
 *     bot was added to; set on the club's card, «Клубы» → ✎);
 *   • no token or no chat id → silently nothing: a club without a chat simply gets no
 *     notifications;
 *   • NOTHING here may break the thing that called it. A lead is already saved when
 *     notifyNewLead runs; every failure (Telegram down, bot removed from the chat,
 *     timeout) is caught and written to integration_events (source «telegram»).
 */

const TELEGRAM_TIMEOUT_MS = 5000;

/** Telegram HTML mode: only these three characters need escaping. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://wiclubcrm.vercel.app").replace(/\/+$/, "");
}

/** A chat id is a number (groups are negative: -1001234567890) or @channelname. */
export function validChatId(value: string): boolean {
  return /^-?\d{5,20}$/.test(value) || /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value);
}

export type TelegramSendResult = { ok: true } | { ok: false; error: string };

export async function sendTelegramMessage(
  chatId: string,
  html: string,
  button?: { text: string; url: string }
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(button && button.url.startsWith("https://")
          ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } }
          : {}),
      }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    // The token is part of the request URL — never echoed into an error message.
    return { ok: false, error: `Telegram ${res.status}: ${body?.description ?? "no description"}` };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "Telegram timeout" : "Telegram request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** The text of one «новый лид» message (pure — tested without Telegram). */
export function newLeadMessage(input: {
  clubName: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  campaign: string | null;
  courseName: string | null;
  cohortDate: string | null;
  note: string | null;
}): string {
  const lines = [`<b>Новый лид · ${esc(input.clubName)}</b>`, "", `<b>${esc(input.name)}</b>`];
  if (input.phone) lines.push(`Телефон: ${esc(input.phone)}`);
  if (input.email) lines.push(`E-mail: ${esc(input.email)}`);
  if (input.courseName) {
    lines.push(`Курс: ${esc(input.courseName)}${input.cohortDate ? ` · поток ${formatDateRu(input.cohortDate)}` : ""}`);
  }
  if (input.source) lines.push(`Источник: ${esc(input.source)}${input.campaign ? ` · ${esc(input.campaign)}` : ""}`);
  if (input.note) lines.push(`Комментарий: ${esc(input.note.length > 200 ? `${input.note.slice(0, 200)}…` : input.note)}`);
  return lines.join("\n");
}

/** Sends «новый лид» for a lead that was just saved. Never throws. */
export async function notifyNewLead(db: Db, leadId: string): Promise<void> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    const { data: lead } = await db
      .from("leads")
      .select("id, partner_id, name, phone, email, source, utm_campaign, note, cohort_start_date, product_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;
    const { data: partner } = await db
      .from("partners")
      .select("name, telegram_chat_id")
      .eq("id", lead.partner_id)
      .maybeSingle();
    const chatId = partner?.telegram_chat_id?.trim();
    if (!partner || !chatId) return;
    const { data: product } = lead.product_id
      ? await db.from("products").select("name").eq("id", lead.product_id).maybeSingle()
      : { data: null };

    const result = await sendTelegramMessage(
      chatId,
      newLeadMessage({
        clubName: partner.name,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        campaign: lead.utm_campaign,
        courseName: product?.name ?? null,
        cohortDate: lead.cohort_start_date,
        note: lead.note,
      }),
      { text: "Открыть в CRM", url: `${appBaseUrl()}/leads?open=${lead.id}` }
    );
    if (!result.ok) {
      await logIntegrationEvent(db as Parameters<typeof logIntegrationEvent>[0], {
        source: "telegram",
        event_type: "new_lead",
        status: "failed",
        detail: `lead=${lead.id} partner=${lead.partner_id} ${result.error}`,
      });
    }
  } catch {
    // A notification must never break lead intake.
  }
}
