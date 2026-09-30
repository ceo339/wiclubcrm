import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canViewFranchise } from "@/lib/franchiseAccess";
import { loadInvoice } from "@/lib/invoice/data";
import { buildInvoicePdf } from "@/lib/invoice/pdf";
import { buildInvoiceDocx } from "@/lib/invoice/docx";
import { invoiceFileName } from "@/lib/invoice/franchisor";

export const runtime = "nodejs";

/**
 * Round 49: download a franchise invoice as PDF or Word —
 * /api/franchise/invoices/<paymentId>/pdf | /docx. Read through the signed-in
 * user's own Supabase client, so RLS (is_hq() / can_view_franchise()) decides
 * who can get it, exactly like the «Оплаты франчайзи» page itself.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await ctx.params;
  if (format !== "pdf" && format !== "docx") return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = await getCurrentProfile();
  if (!profile || !canViewFranchise(profile)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const loaded = await loadInvoice(supabase, id);
  if (!loaded) return NextResponse.json({ error: "not found" }, { status: 404 });

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const name = invoiceFileName(loaded.data, format);
  const disposition = `${inline && format === "pdf" ? "inline" : "attachment"}; filename="${name.replace(
    /[^\x20-\x7e]/g,
    "_"
  )}"; filename*=UTF-8''${encodeURIComponent(name)}`;

  if (format === "pdf") {
    const pdf = await buildInvoicePdf(loaded.data);
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition, "Cache-Control": "no-store" },
    });
  }
  const docx = await buildInvoiceDocx(loaded.data);
  return new NextResponse(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
