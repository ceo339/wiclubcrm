import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SERIF_BOLD_TTF_BASE64, SERIF_REGULAR_TTF_BASE64 } from "./fonts";
import { SIGNATURE_PNG_BASE64 } from "./signature";
import {
  FRANCHISOR,
  formatAmount,
  formatInvoiceDate,
  formatLongDate,
  invoiceTotal,
  type InvoiceData,
} from "./franchisor";

// Round 49: server-side PDF of a franchise invoice, laid out after the finance
// director's Word template (invoice_0709026.pdf): title, one bordered block
// with the franchisor's Chase requisites and the franchisee, then the line
// table, then the signatory with her signature. Used both for the «PDF»
// download and as the attachment of the email to the partner.

const A4 = { w: 595.28, h: 841.89 };
const LEFT = 62;
const RIGHT = 552;
const WIDTH = RIGHT - LEFT;
const INK = rgb(0, 0, 0);
const LINE = rgb(0.25, 0.25, 0.25);
const SHADE = rgb(0.95, 0.95, 0.95);

type Fonts = { regular: PDFFont; bold: PDFFont };
type Run = { text: string; bold?: boolean };

function b64(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

/** Greedy word-wrap of a plain string into lines that fit maxWidth. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Draws a single line made of bold/regular runs. */
function drawRuns(page: PDFPage, runs: Run[], x: number, y: number, size: number, f: Fonts) {
  let cx = x;
  for (const r of runs) {
    const font = r.bold ? f.bold : f.regular;
    page.drawText(r.text, { x: cx, y, size, font, color: INK });
    cx += font.widthOfTextAtSize(r.text, size);
  }
}

function hline(page: PDFPage, y: number, x1 = LEFT, x2 = RIGHT) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: LINE });
}
function vline(page: PDFPage, x: number, y1: number, y2: number) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.6, color: LINE });
}

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Invoice № ${data.number}`);
  doc.setAuthor(FRANCHISOR.name);
  doc.setCreator("WI Club CRM");
  const f: Fonts = {
    regular: await doc.embedFont(b64(SERIF_REGULAR_TTF_BASE64), { subset: true }),
    bold: await doc.embedFont(b64(SERIF_BOLD_TTF_BASE64), { subset: true }),
  };
  const page = doc.addPage([A4.w, A4.h]);
  const size = 10.5;
  const lh = 14;

  // Title
  const title = `Invoice № ${data.number}`;
  page.drawText(title, {
    x: (A4.w - f.bold.widthOfTextAtSize(title, 11.5)) / 2,
    y: A4.h - 52,
    size: 11.5,
    font: f.bold,
    color: INK,
  });

  // ── Requisites block: a stack of bordered sections ──────────────────────
  let y = A4.h - 72; // top edge of the block
  const blockTop = y;
  const pad = 6;

  /** Draws one section (list of lines, each a list of runs) and a rule under it. */
  function section(lines: Run[][], opts: { shade?: boolean; gapAfter?: number } = {}) {
    const h = pad * 2 + lines.length * lh - 3 + (opts.gapAfter ?? 0);
    if (opts.shade) {
      page.drawRectangle({ x: LEFT, y: y - h, width: WIDTH, height: h, color: SHADE });
      hline(page, y);
    }
    let ty = y - pad - size + 1;
    for (const runs of lines) {
      drawRuns(page, runs, LEFT + pad, ty, size, f);
      ty -= lh;
    }
    y -= h;
    hline(page, y);
  }

  const dateLines: Run[][] = [[{ text: `Date invoice: ${formatInvoiceDate(data.date)}` }]];
  if (data.dueDate) dateLines.push([{ text: `Payment due: ${formatInvoiceDate(data.dueDate)}` }]);
  section(dateLines, { shade: true });

  section([[{ text: "Franchisor: ", bold: true }, { text: FRANCHISOR.name, bold: true }], [{ text: FRANCHISOR.address }]], {
    gapAfter: 8,
  });

  section([
    [{ text: `EIN: ${FRANCHISOR.ein}` }],
    [{ text: `Bank: ${FRANCHISOR.bankName}`, bold: true }, { text: `, ${FRANCHISOR.bankAddress}` }],
    [{ text: `Account: ${FRANCHISOR.account}` }],
    [{ text: `Routing No.: ${FRANCHISOR.routing}` }],
    [{ text: `SWIFT: ${FRANCHISOR.swift}` }],
  ]);

  const fr = data.franchisee;
  const frLines: Run[][] = [[{ text: "Franchisee: ", bold: true }, { text: fr.name, bold: true }]];
  if (fr.address) for (const l of wrap(fr.address, f.regular, size, WIDTH - pad * 2)) frLines.push([{ text: l }]);
  if (fr.email) frLines.push([{ text: `E-mail: ${fr.email}` }]);
  if (fr.phone) frLines.push([{ text: `Telephone: ${fr.phone}` }]);
  section(frLines, { gapAfter: 6 });

  section([[{ text: `Currency: ${data.currency}` }]], { shade: true });

  if (data.agreement.number) {
    const agr = `Franchise Agreement No. ${data.agreement.number}${
      data.agreement.date ? ` dated ${formatLongDate(data.agreement.date)}` : ""
    }`;
    section([[{ text: agr, bold: true }]]);
  }

  vline(page, LEFT, blockTop, y);
  vline(page, RIGHT, blockTop, y);
  hline(page, blockTop);

  // ── Line table ──────────────────────────────────────────────────────────
  y -= 14;
  const cols = [
    { title: "№", w: 28 },
    { title: "Description", w: 196 },
    { title: "Quantity", w: 76 },
    { title: `Price, ${data.currency}`, w: 90 },
    { title: `Amount, ${data.currency}`, w: 100 },
  ];
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), LEFT);
  const tableTop = y;

  // header
  const headH = 22;
  cols.forEach((c, i) => page.drawText(c.title, { x: xs[i] + 5, y: y - 14, size: 10, font: f.regular, color: INK }));
  y -= headH;
  hline(page, y);

  data.lines.forEach((line, idx) => {
    const desc = wrap(line.description, f.regular, size, cols[1].w - 10);
    const rowH = Math.max(1, desc.length) * lh + 14;
    const ty = y - 16;
    page.drawText(String(idx + 1), { x: xs[0] + 5, y: ty, size, font: f.regular });
    desc.forEach((l, j) => page.drawText(l, { x: xs[1] + 5, y: ty - j * lh, size, font: f.regular }));
    const centered = (text: string, col: number) =>
      page.drawText(text, {
        x: xs[col] + (cols[col].w - f.regular.widthOfTextAtSize(text, size)) / 2,
        y: ty,
        size,
        font: f.regular,
      });
    centered(formatAmount(line.quantity), 2);
    centered(formatAmount(line.price), 3);
    centered(formatAmount(line.quantity * line.price), 4);
    y -= rowH;
    hline(page, y);
  });

  // total row
  const totalH = 22;
  const totalLabel = "Total:";
  page.drawText(totalLabel, {
    x: xs[3] + (cols[3].w - f.bold.widthOfTextAtSize(totalLabel, size)) / 2,
    y: y - 15,
    size,
    font: f.bold,
  });
  const totalText = formatAmount(invoiceTotal(data));
  page.drawText(totalText, {
    x: xs[4] + (cols[4].w - f.bold.widthOfTextAtSize(totalText, 11.5)) / 2,
    y: y - 15,
    size: 11.5,
    font: f.bold,
  });
  y -= totalH;
  hline(page, y);
  hline(page, tableTop);
  [...xs, RIGHT].forEach((x) => vline(page, x, tableTop, y));

  // ── Signatory ───────────────────────────────────────────────────────────
  y -= 48;
  drawRuns(page, [{ text: `Franchisor: ${FRANCHISOR.name}`, bold: true }], LEFT, y, size + 0.5, f);
  y -= 36;
  page.drawText(FRANCHISOR.signatory, { x: LEFT, y, size, font: f.regular });
  const sig = await doc.embedPng(b64(SIGNATURE_PNG_BASE64));
  const sigW = 110;
  const sigH = (sig.height / sig.width) * sigW;
  page.drawImage(sig, {
    x: LEFT + f.regular.widthOfTextAtSize(FRANCHISOR.signatory, size) + 36,
    y: y - sigH * 0.55,
    width: sigW,
    height: sigH,
  });

  return doc.save();
}
