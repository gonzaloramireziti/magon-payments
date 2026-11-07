// Aviso de cobro mensual en PDF, con el diseño del modelo de Magon (A4, marca de agua MG).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { WATERMARK_PNG_BASE64 } from "./watermark";

export type NoticeData = {
  clientName: string;
  periodLabel: string; // "octubre 2026"
  dueDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  concept: string;
  detail: string;
  issuer: { brand: string; payTo: string; alias: string };
};

const A4 = { width: 595.28, height: 841.89 };
const INK = rgb(0.2, 0.2, 0.2);
const SOFT = rgb(0.35, 0.35, 0.35);
const LINE = rgb(0.45, 0.45, 0.45);

export function formatAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const [intPart, decPart] = Math.abs(rounded).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const symbol = currency === "USD" ? "US$" : "$";
  return `${rounded < 0 ? "-" : ""}${symbol} ${grouped}${decPart === "00" ? "" : `,${decPart}`}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

// El modelo usa letras espaciadas; pdf-lib no tiene "letter-spacing", así que se dibuja letra por letra.
function spacedWidth(text: string, font: PDFFont, size: number, spacing: number): number {
  return [...text].reduce((acc, ch) => acc + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
}

function drawSpaced(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; font: PDFFont; size: number; spacing: number; color?: ReturnType<typeof rgb>; alignRight?: boolean }
) {
  let x = opts.alignRight ? opts.x - spacedWidth(text, opts.font, opts.size, opts.spacing) : opts.x;
  for (const ch of text) {
    page.drawText(ch, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color ?? INK });
    x += opts.font.widthOfTextAtSize(ch, opts.size) + opts.spacing;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function drawNoticePage(doc: PDFDocument, data: NoticeData, fonts: { regular: PDFFont; bold: PDFFont }) {
  const page = doc.addPage([A4.width, A4.height]);
  const { regular, bold } = fonts;
  const top = A4.height;

  const watermark = await doc.embedPng(Buffer.from(WATERMARK_PNG_BASE64, "base64"));
  page.drawImage(watermark, { x: 0, y: 0, width: A4.width, height: A4.height });

  // Encabezado: línea a la izquierda y la marca espaciada a la derecha.
  page.drawLine({ start: { x: 70, y: top - 104 }, end: { x: 300, y: top - 104 }, thickness: 1, color: LINE });
  drawSpaced(page, data.issuer.brand, { x: 525, y: top - 111, font: regular, size: 17, spacing: 3.2, color: SOFT, alignRight: true });

  // Emitido a / Pagar a.
  const labels = { font: bold, size: 8.5, spacing: 1.1, color: INK };
  const values = { font: regular, size: 9, spacing: 0.6, color: SOFT };
  drawSpaced(page, "EMITIDO A:", { ...labels, x: 77, y: top - 177 });
  drawSpaced(page, data.clientName, { ...values, x: 77, y: top - 192 });
  drawSpaced(page, `Período: ${data.periodLabel}`, { ...values, x: 77, y: top - 207 });
  drawSpaced(page, `Vence: ${formatDate(data.dueDate)}`, { ...values, x: 77, y: top - 222 });

  drawSpaced(page, "PAGAR A:", { ...labels, x: 310, y: top - 177 });
  drawSpaced(page, data.issuer.payTo, { ...values, x: 310, y: top - 192 });
  drawSpaced(page, `Alias: ${data.issuer.alias}`, { ...values, x: 310, y: top - 207 });

  // Tabla con un solo concepto.
  drawSpaced(page, "DESCRIPCIÓN", { ...labels, x: 79, y: top - 293 });
  drawSpaced(page, "IMPORTE", { ...labels, x: 512, y: top - 293, alignRight: true });
  page.drawLine({ start: { x: 70, y: top - 304 }, end: { x: 525, y: top - 304 }, thickness: 1, color: LINE });

  const amountText = formatAmount(data.amount, data.currency);
  drawSpaced(page, `${data.concept} · ${data.periodLabel}`, { ...values, size: 9.5, x: 83, y: top - 330, color: INK });
  drawSpaced(page, amountText, { ...values, size: 9.5, x: 512, y: top - 330, color: INK, alignRight: true });
  wrap(data.detail, regular, 8.5, 330).forEach((line, i) => {
    page.drawText(line, { x: 83, y: top - 345 - i * 12, size: 8.5, font: regular, color: SOFT });
  });

  // Totales.
  page.drawLine({ start: { x: 85, y: top - 732 }, end: { x: 538, y: top - 732 }, thickness: 1, color: LINE });
  drawSpaced(page, "SUBTOTAL", { ...labels, x: 92, y: top - 750 });
  drawSpaced(page, amountText, { ...labels, x: 525, y: top - 750, alignRight: true });
  drawSpaced(page, "TOTAL", { ...labels, x: 460, y: top - 765, alignRight: true });
  drawSpaced(page, amountText, { ...labels, x: 525, y: top - 765, alignRight: true });

  const note = `Abonar antes del ${formatDate(data.dueDate)} por transferencia al alias ${data.issuer.alias}. Este aviso no reemplaza a la factura fiscal.`;
  wrap(note, regular, 7.5, 440).forEach((line, i) => {
    page.drawText(line, { x: 92, y: top - 795 - i * 10, size: 7.5, font: regular, color: SOFT });
  });
}

// Uno o varios avisos (una página por cliente) en el mismo PDF.
export async function buildNoticePdf(notices: NoticeData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(notices.length === 1 ? `Aviso de cobro ${notices[0].clientName} ${notices[0].periodLabel}` : "Avisos de cobro");
  doc.setAuthor("MagonSoftware");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  for (const notice of notices) await drawNoticePage(doc, notice, fonts);
  return doc.save();
}
