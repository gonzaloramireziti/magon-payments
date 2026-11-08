// Factura mensual de cada cliente, armada al vuelo desde la fila de `invoices` del período.
// La fila la genera el ciclo de cobro (cron diario + getSubscriptionStatus): el día 1 de cada mes
// aparece la del mes anterior, así que la factura queda disponible ese mismo día.
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import { subscription } from "@/lib/env";
import { addMonths, formatPeriodLabel, localDateParts } from "@/lib/subscription/period";
import { DEFAULT_SERVICE_DESCRIPTION, INVOICE_ISSUER, isServiceType } from "@/lib/billing/config";
import { buildInvoicePdf, type InvoiceData } from "@/lib/billing/invoicePdf";
import { NoticeError } from "@/lib/billing/notices";

type ClientRecord = {
  id: string;
  client_key: string;
  name: string;
  email: string | null;
  service_type: string | null;
  service_description: string | null;
};

const CLIENT_COLUMNS = "id,client_key,name,email,service_type,service_description";

// Prefijo fijo por cliente (8 caracteres, base 36) derivado de su id: no hace falta guardarlo.
export function invoicePrefix(clientId: string): string {
  const hex = clientId.replace(/-/g, "").slice(0, 10);
  return parseInt(hex, 16).toString(36).toUpperCase().padStart(8, "0");
}

// Número correlativo: la factura N° k es la k-ésima del cliente por período. "2DOYI44N-0001".
async function invoiceNumber(clientId: string, period: string): Promise<string> {
  const { count, error } = await getSupabaseAdmin()
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .lte("period", period);
  if (error) throw error;
  return `${invoicePrefix(clientId)}-${String(Math.max(count ?? 1, 1)).padStart(4, "0")}`;
}

async function invoiceFor(client: ClientRecord, period: string): Promise<InvoiceData | null> {
  // Solo el cobro recurrente genera factura mensual (por ahora es el único tipo).
  if (client.service_type && !isServiceType(client.service_type)) return null;

  await getSubscriptionStatus(client.client_key);
  const { data, error } = await getSupabaseAdmin()
    .from("invoices")
    .select("amount,currency,due_date,status,paid_at")
    .eq("client_id", client.id)
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "canceled") return null;

  return {
    number: await invoiceNumber(client.id, period),
    issueDate: `${addMonths(period, 1)}-01`,
    dueDate: data.due_date as string,
    currency: (data.currency as string) ?? "ARS",
    status: data.status as InvoiceData["status"],
    paidAt: data.paid_at ? localDateParts(new Date(data.paid_at as string), subscription.timezone).today : null,
    billTo: { name: client.name, email: client.email },
    lines: [
      {
        description: client.service_description?.trim() || DEFAULT_SERVICE_DESCRIPTION,
        detail: `Período: ${formatPeriodLabel(period)}`,
        quantity: 1,
        unitAmount: Number(data.amount) || 0,
      },
    ],
    issuer: INVOICE_ISSUER,
  };
}

export async function clientInvoice(clientId: string, period: string) {
  const { data, error } = await getSupabaseAdmin().from("clients").select(CLIENT_COLUMNS).eq("id", clientId).maybeSingle();
  if (error) throw error;
  if (!data) throw new NoticeError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
  const invoice = await invoiceFor(data as ClientRecord, period);
  if (!invoice) throw new NoticeError("NO_INVOICE", 404, `${data.name} no tiene factura de ${formatPeriodLabel(period)}`);
  return { bytes: await buildInvoicePdf([invoice]), filename: `Factura-${invoice.number}.pdf` };
}

// Todos los clientes activos con factura en el período, una página por cliente.
export async function allInvoices(period: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  const invoices = (await Promise.all(((data ?? []) as ClientRecord[]).map((c) => invoiceFor(c, period)))).filter(
    (i): i is InvoiceData => i !== null
  );
  if (invoices.length === 0) throw new NoticeError("NO_INVOICE", 404, `No hay facturas de ${formatPeriodLabel(period)}`);
  return { bytes: await buildInvoicePdf(invoices), filename: `Facturas-${period}.pdf` };
}
