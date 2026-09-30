import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPartnerMetaAds } from "@/lib/metaAds";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily Meta Ads sync for every connected club (vercel.json → crons).
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
 * set in the project's env — anything else is refused, so this public URL
 * can't be used to hammer Meta's API with the clubs' tokens.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: conns } = await admin.from("meta_ad_connections").select("partner_id");
  const results: Record<string, string> = {};
  for (const c of conns ?? []) {
    const r = await syncPartnerMetaAds(c.partner_id);
    results[c.partner_id] = r.ok ? `ok (${r.rows})` : `error: ${r.error}`;
  }
  return NextResponse.json({ synced: results });
}
