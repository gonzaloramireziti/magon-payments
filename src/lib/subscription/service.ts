import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subscription, appUrl, galiopay, webhookUrl, corsOrigins } from "@/lib/env";
import {
  getPeriodInfo,
  formatPeriodLabel,
  periodOf,
  dueDateForPeriod,
  addMonths,
  type PeriodInfo,
} from "@/lib/subscription/period";
import { createGalioPayPayment } from "@/lib/galiopay/client";

export type ClientRow = {
  id: string;
  client_key: string;
  name: string;
  email: string | null;
  monthly_amount: number | string;
  currency: string;
  active: boolean;
  notes: string | null;
  start_period: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceRow = {
  id: string;
  client_id: string;
  period: string;
  amount: number | string;
  currency: string;
  due_date: string;
  status: "pending" | "paid" | "overdue" | "canceled";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionState = "active" | "due" | "blocked" | "not_found" | "inactive";

export type SubscriptionStatus = {
  found: boolean;
  active: boolean;
  blocked: boolean;
  state: SubscriptionState;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  amount: number;
  amountDue: number;
  currency: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  today: string;
  daysUntilDue: number;
  invoices: Array<{
    id: string;
    period: string;
    amount: number;
    currency: string;
    dueDate: string;
    status: InvoiceRow["status"];
  }>;
  lastPaymentAt: string | null;
};

export type CheckoutSession = {
  alreadyPaid: boolean;
  paymentId: string | null;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  qrData: string | null;
  providerStatus: string | null;
  reference: string | null;
  expiresAt: string | null;
};

export class SubscriptionError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function periodInfo(): PeriodInfo {
  return getPeriodInfo(new Date(), subscription.timezone, subscription.dueDay);
}

function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const configured = corsOrigins.trim();
  if (configured && configured !== "*") {
    const allowlist = configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!allowlist.includes(url.origin)) return null;
  }
  return url.toString();
}

function withParam(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

export async function findClientByKey(clientKey: string): Promise<ClientRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("client_key", clientKey)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientRow | null) ?? null;
}

async function ensureInvoices(client: ClientRow, info: PeriodInfo): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startPeriod =
    client.start_period ??
    periodOf(new Date(client.created_at), subscription.timezone);

  const periods: string[] = [];
  let cursor = startPeriod;
  while (cursor <= info.billingPeriod && periods.length < 120) {
    periods.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  if (periods.length === 0) return;

  const rows = periods.map((period) => ({
    client_id: client.id,
    period,
    amount: toNumber(client.monthly_amount),
    currency: client.currency,
    due_date: dueDateForPeriod(period, subscription.dueDay),
    status: "pending",
  }));

  const { error } = await supabase
    .from("invoices")
    .upsert(rows, { onConflict: "client_id,period", ignoreDuplicates: true });
  if (error) throw error;
}

async function syncOverdue(clientId: string, today: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("client_id", clientId)
    .eq("status", "pending")
    .lt("due_date", today);
}

export async function getSubscriptionStatus(clientKey: string): Promise<SubscriptionStatus> {
  const info = periodInfo();
  const empty: SubscriptionStatus = {
    found: false,
    active: false,
    blocked: true,
    state: "not_found",
    clientId: null,
    clientName: null,
    clientEmail: null,
    amount: 0,
    amountDue: 0,
    currency: galiopay.currency,
    period: info.billingPeriod,
    periodLabel: formatPeriodLabel(info.billingPeriod),
    dueDate: info.dueDate,
    today: info.today,
    daysUntilDue: info.daysUntilDue,
    invoices: [],
    lastPaymentAt: null,
  };

  if (!clientKey) return empty;

  const client = await findClientByKey(clientKey);
  if (!client) return empty;
  if (!client.active) {
    return {
      ...empty,
      found: true,
      active: false,
      state: "inactive",
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
    };
  }

  await ensureInvoices(client, info);
  await syncOverdue(client.id, info.today);

  const supabase = getSupabaseAdmin();
  const { data: invoiceData, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", client.id)
    .order("due_date", { ascending: true });
  if (error) throw error;

  const invoices = (invoiceData ?? []) as InvoiceRow[];
  const unpaid = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const blocked = unpaid.some((i) => i.due_date < info.today);
  const amountDue = unpaid.reduce((acc, i) => acc + toNumber(i.amount), 0);

  const { data: lastPayment } = await supabase
    .from("payments")
    .select("created_at,status")
    .eq("client_id", client.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let state: SubscriptionState;
  if (blocked) state = "blocked";
  else if (unpaid.length > 0) state = "due";
  else state = "active";

  return {
    found: true,
    active: !blocked,
    blocked,
    state,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    amount: toNumber(client.monthly_amount),
    amountDue,
    currency: client.currency,
    period: info.billingPeriod,
    periodLabel: formatPeriodLabel(info.billingPeriod),
    dueDate: info.dueDate,
    today: info.today,
    daysUntilDue: info.daysUntilDue,
    invoices: invoices.map((i) => ({
      id: i.id,
      period: i.period,
      amount: toNumber(i.amount),
      currency: i.currency,
      dueDate: i.due_date,
      status: i.status,
    })),
    lastPaymentAt: lastPayment?.created_at ?? null,
  };
}

export async function createCheckout(
  clientKey: string,
  returnUrl?: string | null
): Promise<CheckoutSession> {
  const status = await getSubscriptionStatus(clientKey);
  if (!status.found) {
    throw new SubscriptionError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
  }
  if (status.state === "inactive") {
    throw new SubscriptionError("CLIENT_INACTIVE", 403, "Cliente inactivo");
  }

  if (status.amountDue <= 0) {
    return {
      alreadyPaid: true,
      paymentId: null,
      amount: 0,
      currency: status.currency,
      checkoutUrl: null,
      qrData: null,
      providerStatus: "approved",
      reference: null,
      expiresAt: null,
    };
  }

  const supabase = getSupabaseAdmin();
  const paymentId = crypto.randomUUID();
  const reference = `magon-${status.period}-${paymentId}`;
  const description = `Servicio de software - ${status.periodLabel}`.trim();

  const returnTo = safeReturnUrl(returnUrl) ?? `${appUrl.replace(/\/$/, "")}/pago`;
  const successUrl = withParam(returnTo, "paid", "1");
  const failureUrl = withParam(returnTo, "paid", "0");

  const result = await createGalioPayPayment({
    amount: status.amountDue,
    currency: status.currency,
    referenceId: reference,
    paymentId,
    description,
    webhookUrl: webhookUrl(),
    successUrl,
    failureUrl,
    payer: { name: status.clientName ?? undefined, email: status.clientEmail ?? undefined },
  });

  await supabase.from("payments").insert({
    id: paymentId,
    client_id: status.clientId,
    provider: "galiopay",
    provider_payment_id: result.providerPaymentId,
    provider_status: result.providerStatus,
    status: "pending",
    amount: status.amountDue,
    currency: status.currency,
    reference_id: reference,
    raw_payload: result.raw ?? {},
  });

  return {
    alreadyPaid: false,
    paymentId,
    amount: status.amountDue,
    currency: status.currency,
    checkoutUrl: result.checkoutUrl,
    qrData: result.qrData,
    providerStatus: result.providerStatus,
    reference,
    expiresAt: result.expiresAt,
  };
}
