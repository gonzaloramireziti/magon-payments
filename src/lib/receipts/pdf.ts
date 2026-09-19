import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { RECEIPT_COMPANY } from "./config";

export type ReceiptData = {
  receiptNumber: string;
  clientName: string;
  clientEmail?: string | null;
  periodLabel: string;
  dueDate: string;
  paidAt: string | null;
  issuedAt: string;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  reference?: string | null;
  concept: string;
  items: string[];
  note: string;
  company?: {
    name: string;
    tagline: string;
    website: string;
    email?: string;
  };
};

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.36, 0.36, 0.36);
const LIGHT = rgb(0.78, 0.78, 0.78);

function formatMoney(amount: number, currency: string): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const symbol = currency === "ARS" ? "$" : `${currency} `;
  return `${symbol} ${grouped},${decPart}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const datePart = value.slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const M = 52;
  const right = width - M;
  const company = { ...RECEIPT_COMPANY, ...(data.company ?? {}) };
  let y = height - M;

  const text = (
    value: string,
    options: {
      x?: number;
      size?: number;
      useBold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: "left" | "right";
    } = {}
  ) => {
    const size = options.size ?? 10;
    const f = options.useBold ? bold : font;
    const x =
      options.align === "right"
        ? right - f.widthOfTextAtSize(value, size)
        : options.x ?? M;
    page.drawText(value, { x, y, size, font: f, color: options.color ?? BLACK });
  };

  const hr = (gap = 14, color = LIGHT) => {
    y -= gap;
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.7, color });
    y -= 14;
  };

  text(company.name.toUpperCase(), { size: 24, useBold: true });
  text(company.tagline, { size: 9, color: GRAY });
  y -= 8;
  text(company.website, { size: 8, color: GRAY });

  const headerY = height - M;
  const title = "COMPROBANTE DE PAGO";
  page.drawText(title, {
    x: right - bold.widthOfTextAtSize(title, 13),
    y: headerY,
    size: 13,
    font: bold,
    color: BLACK,
  });
  const numberText = `N° ${data.receiptNumber}`;
  page.drawText(numberText, {
    x: right - font.widthOfTextAtSize(numberText, 9),
    y: headerY - 16,
    size: 9,
    font,
    color: GRAY,
  });

  y = headerY - 30;
  hr(0);

  const metaRows: Array<[string, string]> = [
    ["Cliente", data.clientName],
    ["Email", data.clientEmail || "-"],
    ["Emisión", formatDate(data.issuedAt)],
    ["Período facturado", data.periodLabel],
    ["Vencimiento", formatDate(data.dueDate)],
    ["Fecha de pago", formatDate(data.paidAt)],
    ["Medio de pago", data.paymentMethod || "-"],
    ["Referencia", data.reference || "-"],
  ];

  const colWidth = (right - M) / 2;
  for (let i = 0; i < metaRows.length; i += 2) {
    const rowY = y;
    for (let c = 0; c < 2; c += 1) {
      const entry = metaRows[i + c];
      if (!entry) continue;
      const x = M + c * colWidth;
      page.drawText(entry[0].toUpperCase(), {
        x,
        y: rowY,
        size: 7.5,
        font,
        color: GRAY,
      });
      page.drawText(entry[1], { x, y: rowY - 13, size: 10.5, font: bold, color: BLACK });
    }
    y -= 34;
  }

  const statusText = "PAGADO";
  const statusWidth = bold.widthOfTextAtSize(statusText, 9) + 18;
  page.drawRectangle({
    x: M,
    y: y - 4,
    width: statusWidth,
    height: 20,
    borderColor: BLACK,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });
  page.drawText(statusText, {
    x: M + 9,
    y: y + 2,
    size: 9,
    font: bold,
    color: BLACK,
  });
  y -= 34;

  hr(0);

  page.drawText("DETALLE DE COSTOS", { x: M, y, size: 11, font: bold, color: BLACK });
  y -= 22;

  for (const line of wrap(data.concept, bold, 11, right - M)) {
    page.drawText(line, { x: M, y, size: 11, font: bold, color: BLACK });
    y -= 15;
  }
  y -= 6;

  page.drawText("Incluye:", { x: M, y, size: 9, font, color: GRAY });
  y -= 15;
  for (const item of data.items) {
    const lines = wrap(item, font, 10, right - M - 14);
    lines.forEach((line, index) => {
      if (index === 0) {
        page.drawText("-", { x: M + 2, y, size: 10, font, color: BLACK });
      }
      page.drawText(line, { x: M + 14, y, size: 10, font, color: BLACK });
      y -= 14;
    });
  }

  y -= 6;
  hr(0);

  const subtotalLabel = "Subtotal";
  const totalLabel = "TOTAL";
  const amountText = formatMoney(data.amount, data.currency);

  page.drawText(subtotalLabel, { x: M, y, size: 10, font, color: GRAY });
  page.drawText(amountText, {
    x: right - font.widthOfTextAtSize(amountText, 10),
    y,
    size: 10,
    font,
    color: GRAY,
  });
  y -= 22;

  page.drawText(totalLabel, { x: M, y, size: 13, font: bold, color: BLACK });
  page.drawText(amountText, {
    x: right - bold.widthOfTextAtSize(amountText, 13),
    y,
    size: 13,
    font: bold,
    color: BLACK,
  });
  y -= 30;

  const noteLines = wrap(data.note, font, 8, right - M);
  for (const line of noteLines) {
    page.drawText(line, { x: M, y, size: 8, font, color: GRAY });
    y -= 11;
  }

  const footer = `${company.name} - ${company.website}${company.email ? ` - ${company.email}` : ""}`;
  page.drawLine({
    start: { x: M, y: M + 22 },
    end: { x: right, y: M + 22 },
    thickness: 0.7,
    color: LIGHT,
  });
  page.drawText(footer, { x: M, y: M + 8, size: 8, font, color: GRAY });

  return pdf.save();
}
