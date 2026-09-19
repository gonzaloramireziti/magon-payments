import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { galiopay } from "@/lib/env";
import type { InvoiceRow } from "@/lib/subscription/service";

export type NormalizedTransfer = {
  eventId: string;
  providerPaymentId: string | null;
  referenceId: string | null;
  status: string;
  paymentMethodId: string | null;
  amount: number;
  netAmount: number | null;
  currency: string;
  date: string | null;
  moneyReleaseDate: string | null;
  raw: Record<string, unknown>;
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  url: URL
): { ok: boolean; reason?: string } {
  if (galiopay.webhookToken) {
    const provided =
      headers.get("x-galiopay-token") ??
      headers.get("x-webhook-token") ??
      headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      url.searchParams.get("token");
    if (provided && safeEqual(provided, galiopay.webhookToken)) return { ok: true };
    return { ok: false, reason: "token de webhook inválido" };
  }

  if (galiopay.webhookSecret) {
    const signature =
      headers.get("x-galiopay-signature") ??
      headers.get("x-signature") ??
      headers.get("x-hub-signature-256") ??
      "";
    const cleaned = signature.replace(/^sha256=/i, "").trim();
    const expected = createHmac("sha256", galiopay.webhookSecret).update(rawBody).digest("hex");
    if (cleaned && safeEqual(cleaned.toLowerCase(), expected.toLowerCase())) return { ok: true };
    return { ok: false, reason: "firma HMAC inválida" };
  }

  if (!galiopay.isLive) return { ok: true, reason: "sin verificación (modo mock)" };
  return {
    ok: false,
    reason: "webhook sin verificación configurada (GALIOPAY_WEBHOOK_SECRET o GALIOPAY_WEBHOOK_TOKEN)",
  };
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeTransferPayload(payload: Record<string, unknown>): NormalizedTransfer {
  const providerPaymentId =
    (payload.paymentId as string) ??
    (payload.payment_id as string) ??
    (payload.id as string) ??
    null;
  const referenceId =
    (payload.referenceId as string) ??
    (payload.reference_id as string) ??
    (payload.externalReference as string) ??
    null;
  const date = (payload.date as string) ?? null;
  const eventId =
    (payload.id as string) ??
    (payload.eventId as string) ??
    (referenceId ? `${referenceId}:${date ?? ""}` : `${Date.now()}`);

  return {
    eventId,
    providerPaymentId,
    referenceId,
    status: String(payload.status ?? "pending").toLowerCase(),
    paymentMethodId: (payload.paymentMethodId as string) ?? null,
    amount: num(payload.amount),
    netAmount: payload.netAmount === undefined ? null : num(payload.netAmount),
    currency: String(payload.currency ?? galiopay.currency),
    date,
    moneyReleaseDate: (payload.moneyReleaseDate as string) ?? null,
    raw: payload,
  };
}

async function allocatePayment(
  clientId: string,
  amount: number,
  paymentId: string
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["pending", "overdue"])
    .order("due_date", { ascending: true });

  const invoices = (data ?? []) as InvoiceRow[];
  const paidIds: string[] = [];
  let remaining = amount;

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const due = Number(invoice.amount);
    if (remaining + 0.001 >= due) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: now })
        .eq("id", invoice.id);
      if (!error) {
        paidIds.push(invoice.id);
        remaining -= due;
      }
    }
  }

  if (paidIds.length > 0) {
    await supabase
      .from("payments")
      .update({ invoice_id: paidIds[paidIds.length - 1] })
      .eq("id", paymentId);
  }

  return paidIds;
}

export type WebhookResult = {
  duplicate: boolean;
  paymentFound: boolean;
  approved: boolean;
  paidInvoices: string[];
  reason?: string;
};

export async function processGalioPayWebhook(rawBody: string): Promise<WebhookResult> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { duplicate: false, paymentFound: false, approved: false, paidInvoices: [], reason: "JSON inválido" };
  }

  const normalized = normalizeTransferPayload(payload);
  const supabase = getSupabaseAdmin();

  const inserted = await supabase
    .from("webhook_events")
    .insert({
      provider: "galiopay",
      event_id: normalized.eventId,
      event_type: normalized.status,
      payload,
    })
    .select("id")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return { duplicate: true, paymentFound: true, approved: false, paidInvoices: [] };
    }
    throw inserted.error;
  }

  let payment: { id: string; client_id: string } | null = null;
  if (normalized.referenceId) {
    const { data } = await supabase
      .from("payments")
      .select("id,client_id")
      .eq("reference_id", normalized.referenceId)
      .maybeSingle();
    payment = data ?? null;
  }
  if (!payment && normalized.providerPaymentId) {
    const { data } = await supabase
      .from("payments")
      .select("id,client_id")
      .eq("provider_payment_id", normalized.providerPaymentId)
      .maybeSingle();
    payment = data ?? null;
  }

  if (!payment) {
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), error: "pago no encontrado" })
      .eq("id", inserted.data.id);
    return { duplicate: false, paymentFound: false, approved: false, paidInvoices: [], reason: "pago no encontrado" };
  }

  await supabase
    .from("payments")
    .update({
      provider_payment_id: normalized.providerPaymentId,
      provider_status: normalized.status,
      status: normalized.status,
      payment_method: normalized.paymentMethodId,
      net_amount: normalized.netAmount,
      money_release_date: normalized.moneyReleaseDate,
      currency: normalized.currency,
      raw_payload: payload,
    })
    .eq("id", payment.id);

  let paidInvoices: string[] = [];
  if (normalized.status === "approved") {
    paidInvoices = await allocatePayment(payment.client_id, normalized.amount, payment.id);
  }

  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", inserted.data.id);

  return {
    duplicate: false,
    paymentFound: true,
    approved: normalized.status === "approved",
    paidInvoices,
  };
}
