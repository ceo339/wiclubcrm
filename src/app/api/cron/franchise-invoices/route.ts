import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOverdueDigest, type OverdueRow } from "@/lib/invoice/email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Round 49: overdue franchise invoices → email to the finance director
 * (vercel.json → crons, daily). To avoid a daily nag about the same debt, a
 * digest goes out only when
 *   • some invoice became overdue today (due date was yesterday), or
 *   • it's Monday — weekly summary of everything still overdue.
 * Recipients: every account with franchise_access = 'finance', plus any
 * addresses in FRANCHISE_FINANCE_EMAIL (comma-separated); if neither exists,
 * the HQ accounts. Same CRON_SECRET guard as /api/cron/meta-ads.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const { data: open } = await admin
    .from("franchise_payments")
    .select("id, invoice_number, amount, due_date, sent_at, last_reminder_at, franchise_candidates(name)")
    .eq("status", "invoiced")
    .lt("due_date", today)
    .order("due_date");

  const rows: OverdueRow[] = (open ?? [])
    .filter((p) => p.due_date)
    .map((p) => ({
      id: p.id,
      invoice_number: p.invoice_number,
      amount: Number(p.amount),
      due_date: p.due_date as string,
      sent_at: p.sent_at,
      last_reminder_at: p.last_reminder_at,
      candidateName: (p.franchise_candidates as { name: string } | null)?.name ?? "—",
    }));

  const isMonday = new Date().getUTCDay() === 1;
  const newlyOverdue = rows.some((r) => r.due_date === yesterday);
  if (rows.length === 0 || (!force && !isMonday && !newlyOverdue)) {
    return NextResponse.json({ overdue: rows.length, sent: false });
  }

  const recipients = new Set<string>();
  for (const e of (process.env.FRANCHISE_FINANCE_EMAIL ?? "").split(",")) if (e.trim()) recipients.add(e.trim());
  const { data: finance } = await admin.from("profiles").select("id").eq("franchise_access", "finance");
  let ids = (finance ?? []).map((p) => p.id);
  if (ids.length === 0 && recipients.size === 0) {
    const { data: hq } = await admin.from("profiles").select("id").eq("role", "hq");
    ids = (hq ?? []).map((p) => p.id);
  }
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) recipients.add(data.user.email);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wiclubcrm.vercel.app";
  const error = await sendOverdueDigest([...recipients], rows, appUrl);
  return NextResponse.json({ overdue: rows.length, sent: !error, recipients: recipients.size, error });
}
