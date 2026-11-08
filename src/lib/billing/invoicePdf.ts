// Factura mensual en PDF (carta), con el mismo formato que las facturas de Magon Software LLC.
// Se arma al vuelo desde la fila de `invoices`: no se guarda ningún documento.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { INTER_MEDIUM_TTF_BASE64, INTER_REGULAR_TTF_BASE64, INTER_SEMIBOLD_TTF_BASE64 } from "./interFonts";

export type InvoiceIssuer = { name: string; addressLines: string[]; phone: string };

export type InvoiceLine = { description: string; detail?: string; quantity: number; unitAmount: number };

export type InvoiceData = {
  number: string; // "2DOYI44N-0001"
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  currency: string;
  status: "pending" | "paid" | "overdue" | "canceled";
  paidAt: string | null;
  billTo: { name: string; email: string | null };
  lines: InvoiceLine[];
  issuer: InvoiceIssuer;
};

const LETTER = { width: 612, height: 792 };
const MARGIN = 30;
const RIGHT = LETTER.width - MARGIN;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.502, 0.502, 0.502);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.9216, 0.9216, 0.9216);
const ASCENT = 0.969; // ascendente de Inter, para ubicar el texto por su borde superior como en el modelo.

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "USD700.00", "ARS150,000.00": el formato del modelo.
export function invoiceMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const [intPart, decPart] = Math.abs(rounded).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}${currency}${grouped}.${decPart}`;
}

// "6 de noviembre de 2026".
export function invoiceDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} de ${MONTHS[m - 1]} de ${y}` : iso;
}

type Fonts = { regular: PDFFont; medium: PDFFont; semibold: PDFFont };
type TextOpts = { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" };

// `top` es el borde superior del texto medido desde arriba de la hoja, como en el modelo.
function text(page: PDFPage, value: string, x: number, top: number, opts: TextOpts) {
  const width = opts.align === "right" ? opts.font.widthOfTextAtSize(value, opts.size) : 0;
  page.drawText(value, {
    x: x - width,
    y: LETTER.height - top - ASCENT * opts.size,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? BLACK,
  });
}

function rule(page: PDFPage, top: number, x0: number, x1: number, thickness: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x0, y: LETTER.height - top - thickness, width: x1 - x0, height: thickness, color });
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawInvoicePage(doc: PDFDocument, data: InvoiceData, fonts: Fonts) {
  const page = doc.addPage([LETTER.width, LETTER.height]);
  const { regular, medium, semibold } = fonts;
  const body = { font: regular, size: 9 };

  const total = data.lines.reduce((acc, l) => acc + l.quantity * l.unitAmount, 0);
  const paid = data.status === "paid";
  const amountDue = paid ? 0 : total;
  const totalText = invoiceMoney(total, data.currency);
  const headline = paid
    ? `${totalText} pagado${data.paidAt ? ` el ${invoiceDate(data.paidAt)}` : ""}`
    : `${totalText} vence el ${invoiceDate(data.dueDate)}`;

  // Barra superior.
  page.drawRectangle({ x: 0, y: LETTER.height - 4, width: LETTER.width, height: 4, color: BLACK });

  // Encabezado.
  text(page, "Factura", MARGIN, 30.6, { font: semibold, size: 18 });
  text(page, data.issuer.name, RIGHT, 30.6, { font: semibold, size: 18, color: GRAY, align: "right" });

  text(page, "Número de factura", MARGIN, 69.3, { font: semibold, size: 9 });
  text(page, data.number, 130.5, 69.3, { font: semibold, size: 9 });
  text(page, "Fecha de emisión", MARGIN, 82.8, { font: medium, size: 9 });
  text(page, invoiceDate(data.issueDate), 130.5, 82.8, body);
  text(page, "Fecha de vencimiento", MARGIN, 96.3, { font: medium, size: 9 });
  text(page, invoiceDate(data.dueDate), 130.5, 96.3, body);

  // Emisor y cliente.
  text(page, data.issuer.name, MARGIN, 124.8, { font: semibold, size: 9 });
  [...data.issuer.addressLines, data.issuer.phone].filter(Boolean).forEach((line, i) => {
    text(page, line, MARGIN, 141.3 + i * 13.5, body);
  });
  text(page, "Facturar a", 250.8, 124.8, { font: semibold, size: 9 });
  [data.billTo.name, data.billTo.email ?? ""].filter(Boolean).forEach((line, i) => {
    text(page, line, 250.8, 141.3 + i * 13.5, body);
  });

  text(page, headline, MARGIN, 230.7, { font: semibold, size: 13.5 });

  // Tabla de conceptos. Las columnas numéricas se ensanchan con el monto (con montos chicos quedan como el modelo).
  const head = { font: regular, size: 7.5 };
  const GAP = 30;
  const widest = (label: string, values: string[]) =>
    Math.max(regular.widthOfTextAtSize(label, 7.5), ...values.map((v) => regular.widthOfTextAtSize(v, 9)));
  const amounts = data.lines.map((l) => invoiceMoney(l.quantity * l.unitAmount, data.currency));
  const prices = data.lines.map((l) => invoiceMoney(l.unitAmount, data.currency));
  const priceRight = Math.min(501.8, RIGHT - widest("Importe", amounts) - GAP);
  const qtyRight = Math.min(420.8, priceRight - widest("Precio unitario", prices) - GAP);
  const descWidth = Math.min(360, qtyRight - widest("Cant.", data.lines.map((l) => String(l.quantity))) - 12 - MARGIN);

  text(page, "Descripción", MARGIN, 273.2, head);
  text(page, "Cant.", qtyRight, 273.2, { ...head, align: "right" });
  text(page, "Precio unitario", priceRight, 272.5, { ...head, align: "right" });
  text(page, "Importe", RIGHT, 272.5, { ...head, align: "right" });
  rule(page, 288, MARGIN, RIGHT, 0.7, BLACK);

  let top = 293.5;
  data.lines.forEach((line, i) => {
    const rowTop = top;
    for (const piece of wrap(line.description, regular, 9, descWidth)) {
      text(page, piece, MARGIN, top, body);
      top += 13.5;
    }
    if (line.detail) {
      text(page, line.detail, MARGIN, top, { font: regular, size: 7.5, color: MUTED });
      top += 12;
    }
    text(page, String(line.quantity), qtyRight, rowTop, { ...body, align: "right" });
    text(page, prices[i], priceRight, rowTop, { ...body, align: "right" });
    text(page, amounts[i], RIGHT, rowTop, { ...body, align: "right" });
    top += 4;
  });

  // Totales.
  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", totalText, false],
    ["Total", totalText, false],
    ...(paid ? ([["Importe pagado", totalText, false]] as Array<[string, string, boolean]>) : []),
    ["Importe adeudado", invoiceMoney(amountDue, data.currency), true],
  ];
  top += 11.8;
  for (const [label, value, strong] of rows) {
    rule(page, top - 1.8, 306, RIGHT, 0.75, RULE);
    const font = strong ? semibold : regular;
    text(page, label, 306, top, { font, size: 9 });
    text(page, value, RIGHT, top, { font, size: 9, align: "right" });
    top += 14.2;
  }

  // Pie.
  rule(page, 731.2, MARGIN, RIGHT, 0.8, RULE);
  text(page, `${data.number} · ${headline}`, MARGIN, 746.7, { font: regular, size: 7.5 });
  text(page, "Página 1 de 1", RIGHT, 746.7, { font: regular, size: 7.5, align: "right" });
}

// Una o varias facturas (una página cada una) en el mismo PDF.
export async function buildInvoicePdf(invoices: InvoiceData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(invoices.length === 1 ? `Factura ${invoices[0].number}` : "Facturas");
  doc.setAuthor(invoices[0]?.issuer.name ?? "Magon Software LLC");
  const fonts: Fonts = {
    regular: await doc.embedFont(Buffer.from(INTER_REGULAR_TTF_BASE64, "base64"), { subset: false }),
    medium: await doc.embedFont(Buffer.from(INTER_MEDIUM_TTF_BASE64, "base64"), { subset: false }),
    semibold: await doc.embedFont(Buffer.from(INTER_SEMIBOLD_TTF_BASE64, "base64"), { subset: false }),
  };
  for (const invoice of invoices) drawInvoicePage(doc, invoice, fonts);
  return doc.save();
}
