import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin/auth";
import { allocatePaymentToInvoices, markInvoicesPaid } from "@/lib/subscription/allocation";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) return errorJson("Falta clientId", 400, "MISSING_CLIENT");

  const supabase = getSupabaseAdmin();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id,name,currency")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) return errorJson(clientError.message, 500, "DB_ERROR");
  if (!client) return errorJson("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");

  const method =
    typeof body.method === "string" && body.method.trim() !== "" ? body.method.trim() : "manual";
  const note = typeof body.note === "string" ? body.note : null;
  const invoiceIds = Array.isArray(body.invoiceIds)
    ? body.invoiceIds.filter((value): value is string => typeof value === "string")
    : [];

  const paymentId = crypto.randomUUID();
  let amount = 0;
  let paidInvoices: string[] = [];

  try {
    if (invoiceIds.length > 0) {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("id,amount")
        .eq("client_id", clientId)
        .in("id", invoiceIds);
      if (error) throw error;
      const rows = invoices ?? [];
      if (rows.length === 0) {
        return errorJson("Facturas inválidas", 400, "INVALID_INVOICES");
      }
      amount = rows.reduce((acc, invoice) => acc + Number(invoice.amount), 0);
      paidInvoices = await markInvoicesPaid(rows.map((invoice) => invoice.id as string));
    } else {
      const requested = Number(body.amount);
      if (!Number.isFinite(requested) || requested <= 0) {
        return errorJson("Monto inválido", 400, "INVALID_AMOUNT");
      }
      amount = requested;
      paidInvoices = await allocatePaymentToInvoices(clientId, amount, null);
    }

    const { error: insertError } = await supabase.from("payments").insert({
      id: paymentId,
      client_id: clientId,
      provider: "manual",
      provider_status: "approved",
      status: "approved",
      payment_method: method,
      amount,
      currency: client.currency,
      reference_id: `manual-${paymentId}`,
      invoice_id: paidInvoices[paidInvoices.length - 1] ?? null,
      raw_payload: { note, paidInvoices, source: "admin" },
    });
    if (insertError) throw insertError;
  } catch (error) {
    console.error("[api/admin/payments]", error);
    return errorJson("No se pudo registrar el pago", 500, "PAYMENT_ERROR");
  }

  return okJson({ paymentId, amount, paidInvoices });
}
