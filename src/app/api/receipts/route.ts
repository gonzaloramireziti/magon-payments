import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findClientByKey, type InvoiceRow } from "@/lib/subscription/service";
import { formatPeriodLabel } from "@/lib/subscription/period";
import { getClientKeyFromRequest } from "@/lib/guards/requireSubscription";
import { buildReceiptPdf } from "@/lib/receipts/pdf";
import { RECEIPT_CONCEPT, RECEIPT_ITEMS, RECEIPT_NOTE } from "@/lib/receipts/config";
import { errorJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: "Transferencia bancaria",
  CARD: "Tarjeta",
  CASH: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
};

function methodLabel(value: string | null | undefined): string {
  if (!value) return "Transferencia bancaria";
  return METHOD_LABELS[value.toUpperCase()] ?? value;
}

export async function GET(request: NextRequest) {
  const clientKey = getClientKeyFromRequest(request);
  const invoiceId = new URL(request.url).searchParams.get("invoiceId");
  const period = new URL(request.url).searchParams.get("period");

  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  if (!invoiceId && !period) {
    return errorJson("Falta invoiceId o period", 400, "MISSING_INVOICE");
  }

  try {
    const client = await findClientByKey(clientKey);
    if (!client) return errorJson("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");

    const supabase = getSupabaseAdmin();
    let query = supabase.from("invoices").select("*").eq("client_id", client.id);
    query = invoiceId ? query.eq("id", invoiceId) : query.eq("period", period ?? "");
    const { data: invoiceData, error } = await query.maybeSingle();
    if (error) throw error;

    const invoice = invoiceData as InvoiceRow | null;
    if (!invoice) return errorJson("Factura no encontrada", 404, "INVOICE_NOT_FOUND");
    if (invoice.status !== "paid") {
      return errorJson("La factura todavía no está paga", 409, "INVOICE_NOT_PAID");
    }

    const { data: payment } = await supabase
      .from("payments")
      .select("reference_id,provider_payment_id,payment_method,created_at")
      .eq("client_id", client.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const bytes = await buildReceiptPdf({
      receiptNumber: `${invoice.period.replace("-", "")}-${invoice.id.slice(0, 6).toUpperCase()}`,
      clientName: client.name,
      clientEmail: client.email,
      periodLabel: formatPeriodLabel(invoice.period),
      dueDate: invoice.due_date,
      paidAt: invoice.paid_at ?? payment?.created_at ?? null,
      issuedAt: invoice.paid_at ?? new Date().toISOString(),
      amount: Number(invoice.amount),
      currency: invoice.currency,
      paymentMethod: methodLabel(payment?.payment_method),
      reference: payment?.reference_id ?? payment?.provider_payment_id ?? null,
      concept: `${RECEIPT_CONCEPT} - ${formatPeriodLabel(invoice.period)}`,
      items: RECEIPT_ITEMS,
      note: RECEIPT_NOTE,
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="comprobante-${invoice.period}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/receipts]", error);
    return errorJson("No se pudo generar el comprobante", 500, "RECEIPT_ERROR");
  }
}
