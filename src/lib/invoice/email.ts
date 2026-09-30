import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getFromAddress, getResendClient } from "@/lib/resend";
import { loadInvoice } from "./data";
import { buildInvoicePdf } from "./pdf";
import { FRANCHISOR, formatAmount, formatInvoiceDate, invoiceFileName, invoiceTotal } from "./franchisor";

// Round 49: emails around franchise invoices, sent through the same Resend
// account/domain as the rest of the CRM (RESEND_API_KEY, RESEND_FROM_EMAIL).
//   • sendInvoiceToPartner — the invoice PDF to the franchisee (first send or
//     a payment reminder), Reply-To = whoever pressed the button, so the
//     partner's answer lands in the finance director's own mailbox.
//   • sendOverdueDigest — the daily cron's summary for the finance director.

type Db = SupabaseClient<Database>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type SendInvoiceResult = { error: string | null; sentTo?: string };

export async function sendInvoiceToPartner(
  db: Db,
  paymentId: string,
  opts: { reminder: boolean; replyTo: string | null }
): Promise<SendInvoiceResult> {
  const loaded = await loadInvoice(db, paymentId);
  if (!loaded) return { error: "errGeneric" };
  const { payment, candidate, data } = loaded;
  if (payment.status !== "invoiced") return { error: "fpErrNotOpen" };
  const to = candidate.email?.trim();
  if (!to) return { error: "fpErrNoEmail" };

  let resend;
  try {
    resend = getResendClient();
  } catch {
    return { error: "errResendNotConfigured" };
  }

  const pdf = await buildInvoicePdf(data);
  const total = `$${formatAmount(invoiceTotal(data))}`;
  const due = data.dueDate ? formatInvoiceDate(data.dueDate) : null;
  const dueRu = data.dueDate ? data.dueDate.split("-").reverse().join(".") : null;
  const firstName = candidate.name.trim().split(/\s+/)[0] || candidate.name;
  const enName = data.franchisee.name;

  const subject = opts.reminder
    ? `Напоминание об оплате / Payment reminder — Invoice № ${data.number}`
    : `Счёт / Invoice № ${data.number} — ${FRANCHISOR.name}`;

  const ruIntro = opts.reminder
    ? `напоминаем, что счёт № ${esc(data.number)} на сумму <b>${total}</b> ещё не оплачен${
        dueRu ? ` (срок оплаты — ${dueRu})` : ""
      }. Счёт повторно во вложении.`
    : `направляем счёт № ${esc(data.number)} на сумму <b>${total}</b>${
        dueRu ? `, срок оплаты — <b>${dueRu}</b>` : ""
      }. Счёт во вложении (PDF).`;
  const enIntro = opts.reminder
    ? `this is a friendly reminder that invoice № ${esc(data.number)} for <b>${total}</b> is still outstanding${
        due ? ` (due ${due})` : ""
      }. Please find the invoice attached again.`
    : `please find attached invoice № ${esc(data.number)} for <b>${total}</b>${due ? `, due <b>${due}</b>` : ""}.`;

  const line = data.lines[0]?.description ?? "";
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:600px">
  <p>Здравствуйте, ${esc(firstName)}!</p>
  <p>${ruIntro}</p>
  <p>Оплата — банковским переводом на счёт ${esc(FRANCHISOR.name)} в ${esc(FRANCHISOR.bankName)}, реквизиты указаны в счёте. Пожалуйста, укажите номер счёта (${esc(data.number)}) в назначении платежа.</p>
  <p>Если есть вопросы — просто ответьте на это письмо.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
  <p>Dear ${esc(enName)},</p>
  <p>${enIntro}</p>
  <p style="color:#555">${esc(line)}</p>
  <p>Payment by bank transfer to ${esc(FRANCHISOR.name)}, ${esc(FRANCHISOR.bankName)} — bank details are on the invoice. Please quote the invoice number (${esc(data.number)}) as the payment reference.</p>
  <p>If you have any questions, simply reply to this email.</p>
  <p style="margin-top:24px">Kind regards,<br>${esc(FRANCHISOR.name)} · WI Club</p>
</div>`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [to],
    subject,
    html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    attachments: [{ filename: invoiceFileName(data, "pdf"), content: Buffer.from(pdf) }],
  });
  if (error) return { error: error.message };

  const now = new Date().toISOString();
  await db
    .from("franchise_payments")
    .update(opts.reminder ? { last_reminder_at: now, sent_to: to } : { sent_at: now, sent_to: to })
    .eq("id", paymentId);
  return { error: null, sentTo: to };
}

export type OverdueRow = {
  id: string;
  invoice_number: string | null;
  amount: number;
  due_date: string;
  candidateName: string;
  sent_at: string | null;
  last_reminder_at: string | null;
};

/** Summary for the finance director: every open invoice past its due date. */
export async function sendOverdueDigest(to: string[], rows: OverdueRow[], appUrl: string): Promise<string | null> {
  if (to.length === 0 || rows.length === 0) return null;
  let resend;
  try {
    resend = getResendClient();
  } catch {
    return "errResendNotConfigured";
  }
  const today = new Date().toISOString().slice(0, 10);
  const days = (d: string) => Math.max(1, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const tr = rows
    .map(
      (r) => `<tr>
  <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.candidateName)}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #eee">№ ${esc(r.invoice_number ?? "—")}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">$${formatAmount(Number(r.amount))}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.due_date.split("-").reverse().join(".")} (${days(r.due_date)} дн.)</td>
  <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#777">${
    r.last_reminder_at
      ? `напоминание ${r.last_reminder_at.slice(0, 10).split("-").reverse().join(".")}`
      : r.sent_at
        ? "счёт отправлен"
        : "счёт не отправлялся из CRM"
  }</td>
</tr>`
    )
    .join("");
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">
  <p>Просроченные счета франчайзи: <b>${rows.length}</b> на сумму <b>$${formatAmount(total)}</b>.</p>
  <p>Если оплата уже пришла на Chase — отметьте счёт оплаченным в CRM. Если нет — можно отправить партнёру напоминание кнопкой «Напомнить» в разделе «Оплаты франчайзи».</p>
  <table style="border-collapse:collapse;font-size:13px">${tr}</table>
  <p style="margin-top:20px"><a href="${esc(appUrl)}/franchise/payments?status=overdue">Открыть «Оплаты франчайзи»</a></p>
</div>`;
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `Просрочено счетов франчайзи: ${rows.length} ($${formatAmount(total)})`,
    html,
  });
  return error ? error.message : null;
}
