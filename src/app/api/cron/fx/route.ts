import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFxRates } from "@/lib/server/fx";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Round 94: ручной запуск загрузки курсов EUR→USD (тот же CRON_SECRET). Ежедневно это делает /api/cron/franchise-invoices. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await syncFxRates(createAdminClient());
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
