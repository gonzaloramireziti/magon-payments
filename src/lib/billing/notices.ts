import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subscription } from "@/lib/env";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import { formatPeriodLabel, getPeriodInfo } from "@/lib/subscription/period";
import { NOTICE_CONCEPT, NOTICE_DETAIL, NOTICE_ISSUER } from "@/lib/billing/config";
import { buildNoticePdf, type NoticeData } from "@/lib/billing/noticePdf";

export class NoticeError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

type ClientRecord = { id: string; client_key: string; name: string; active: boolean };

// El aviso sale de la factura del período (la genera getSubscriptionStatus si todavía no existe).
async function noticeFor(client: ClientRecord, period: string): Promise<NoticeData | null> {
  await getSubscriptionStatus(client.client_key);
  const { data, error } = await getSupabaseAdmin()
    .from("invoices")
    .select("amount,currency,due_date,status")
    .eq("client_id", client.id)
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "canceled") return null;
  return {
    clientName: client.name,
    periodLabel: formatPeriodLabel(period),
    dueDate: data.due_date as string,
    amount: Number(data.amount) || 0,
    currency: (data.currency as string) ?? "ARS",
    concept: NOTICE_CONCEPT,
    detail: NOTICE_DETAIL,
    issuer: NOTICE_ISSUER,
  };
}

export function defaultPeriod(): string {
  return getPeriodInfo(new Date(), subscription.timezone, subscription.dueDay).billingPeriod;
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function clientNotice(clientId: string, period: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select("id,client_key,name,active")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NoticeError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
  const notice = await noticeFor(data as ClientRecord, period);
  if (!notice) throw new NoticeError("NO_INVOICE", 404, `${data.name} no tiene factura de ${formatPeriodLabel(period)}`);
  return { bytes: await buildNoticePdf([notice]), filename: `Magon-${slug(data.name as string)}-${period}.pdf` };
}

// Todos los clientes activos con factura en el período, una página por cliente.
export async function allNotices(period: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select("id,client_key,name,active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  const notices = (await Promise.all(((data ?? []) as ClientRecord[]).map((c) => noticeFor(c, period)))).filter(
    (n): n is NoticeData => n !== null
  );
  if (notices.length === 0) throw new NoticeError("NO_INVOICE", 404, `No hay facturas de ${formatPeriodLabel(period)}`);
  return { bytes: await buildNoticePdf(notices), filename: `Magon-avisos-${period}.pdf` };
}
