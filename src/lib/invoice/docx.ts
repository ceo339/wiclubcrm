import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableLayoutType,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { SIGNATURE_PNG_BASE64 } from "./signature";
import {
  FRANCHISOR,
  formatAmount,
  formatInvoiceDate,
  formatLongDate,
  invoiceTotal,
  type InvoiceData,
} from "./franchisor";

// Round 49: the same invoice as ./pdf.ts, as an editable Word file — for the
// rare case the finance director wants to tweak something by hand before
// sending it herself. Layout mirrors her own template.

const FONT = "Times New Roman";
const SIZE = 21; // half-points → 10.5pt
const border = { style: BorderStyle.SINGLE, size: 4, color: "404040" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

type Run = { text: string; bold?: boolean };

function para(runs: Run[] | string, opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; size?: number } = {}) {
  const list: Run[] = typeof runs === "string" ? [{ text: runs }] : runs;
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 20 },
    children: list.map((r) => new TextRun({ text: r.text, bold: r.bold, font: FONT, size: opts.size ?? SIZE })),
  });
}

/** One full-width bordered block section (a row of the 1-column table). */
function blockRow(lines: Run[][], shade = false) {
  return new TableRow({
    children: [
      new TableCell({
        borders,
        shading: shade ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" } : undefined,
        margins: { top: 80, bottom: 80, left: 110, right: 110 },
        children: lines.map((l) => para(l)),
      }),
    ],
  });
}

function cell(text: string, width: number, opts: { bold?: boolean; center?: boolean; size?: number } = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      para([{ text, bold: opts.bold }], {
        align: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        size: opts.size,
      }),
    ],
  });
}

export async function buildInvoiceDocx(data: InvoiceData): Promise<Buffer> {
  const fr = data.franchisee;
  const dateLines: Run[][] = [[{ text: `Date invoice: ${formatInvoiceDate(data.date)}` }]];
  if (data.dueDate) dateLines.push([{ text: `Payment due: ${formatInvoiceDate(data.dueDate)}` }]);
  const frLines: Run[][] = [[{ text: `Franchisee: ${fr.name}`, bold: true }]];
  if (fr.address) frLines.push([{ text: fr.address }]);
  if (fr.email) frLines.push([{ text: `E-mail: ${fr.email}` }]);
  if (fr.phone) frLines.push([{ text: `Telephone: ${fr.phone}` }]);

  const blockRows = [
    blockRow(dateLines, true),
    blockRow([[{ text: `Franchisor: ${FRANCHISOR.name}`, bold: true }], [{ text: FRANCHISOR.address }]]),
    blockRow([
      [{ text: `EIN: ${FRANCHISOR.ein}` }],
      [{ text: `Bank: ${FRANCHISOR.bankName}`, bold: true }, { text: `, ${FRANCHISOR.bankAddress}` }],
      [{ text: `Account: ${FRANCHISOR.account}` }],
      [{ text: `Routing No.: ${FRANCHISOR.routing}` }],
      [{ text: `SWIFT: ${FRANCHISOR.swift}` }],
    ]),
    blockRow(frLines),
    blockRow([[{ text: `Currency: ${data.currency}` }]], true),
  ];
  if (data.agreement.number) {
    blockRows.push(
      blockRow([
        [
          {
            text: `Franchise Agreement No. ${data.agreement.number}${
              data.agreement.date ? ` dated ${formatLongDate(data.agreement.date)}` : ""
            }`,
            bold: true,
          },
        ],
      ])
    );
  }

  const widths = [560, 3900, 1500, 1750, 1900];
  const header = new TableRow({
    children: ["№", "Description", "Quantity", `Price, ${data.currency}`, `Amount, ${data.currency}`].map((t, i) =>
      cell(t, widths[i], { size: 20 })
    ),
  });
  const lineRows = data.lines.map(
    (l, i) =>
      new TableRow({
        children: [
          cell(String(i + 1), widths[0]),
          cell(l.description, widths[1]),
          cell(formatAmount(l.quantity), widths[2], { center: true }),
          cell(formatAmount(l.price), widths[3], { center: true }),
          cell(formatAmount(l.quantity * l.price), widths[4], { center: true }),
        ],
      })
  );
  const totalRow = new TableRow({
    children: [
      cell("", widths[0]),
      cell("", widths[1]),
      cell("", widths[2]),
      cell("Total:", widths[3], { bold: true, center: true }),
      cell(formatAmount(invoiceTotal(data)), widths[4], { bold: true, center: true, size: 23 }),
    ],
  });

  const signatureRow = new Table({
    width: { size: 9610, type: WidthType.DXA },
    columnWidths: [2600, 7010],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
            width: { size: 2600, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            children: [para(FRANCHISOR.signatory)],
          }),
          new TableCell({
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
            width: { size: 7010, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    type: "png",
                    data: Buffer.from(SIGNATURE_PNG_BASE64, "base64"),
                    transformation: { width: 140, height: 86 },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: FRANCHISOR.name,
    title: `Invoice № ${data.number}`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1150, right: 1150 } } },
        children: [
          para([{ text: `Invoice № ${data.number}`, bold: true }], { align: AlignmentType.CENTER, after: 240, size: 23 }),
          new Table({ width: { size: 9610, type: WidthType.DXA }, columnWidths: [9610], rows: blockRows }),
          para("", { after: 200 }),
          new Table({
            width: { size: 9610, type: WidthType.DXA },
            columnWidths: widths,
            layout: TableLayoutType.FIXED,
            rows: [header, ...lineRows, totalRow],
          }),
          para("", { after: 600 }),
          para([{ text: `Franchisor: ${FRANCHISOR.name}`, bold: true }], { after: 120 }),
          signatureRow,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
