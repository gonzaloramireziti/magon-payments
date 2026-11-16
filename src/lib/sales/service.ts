import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Ventas (migración 015): prospectos con etapa, presupuesto, abono mensual esperado y próximo paso.
 * «Ganado» lo convierte en cliente (con su KEY y el abono como monto mensual). Solo admins.
 */

export class SalesError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const LEAD_STAGES = ["new", "contacted", "proposal", "negotiation", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  quote_amount: number | null;
  monthly_amount: number | null;
  currency: "ARS" | "USD";
  next_step: string | null;
  next_step_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  client_id: string | null;
  lost_reason: string | null;
  notes: string | null;
  stage_since: string;
  created_at: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function amount(value: unknown): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new SalesError("INVALID_AMOUNT", 400, "El monto no es válido");
  return n;
}

type Row = Omit<Lead, "owner_name" | "quote_amount" | "monthly_amount"> & {
  quote_amount: number | string | null;
  monthly_amount: number | string | null;
  admin_users: { name: string } | null;
};

function toLead(row: Row): Lead {
  const { admin_users, ...rest } = row;
  return {
    ...rest,
    owner_name: admin_users?.name ?? null,
    quote_amount: row.quote_amount === null ? null : Number(row.quote_amount),
    monthly_amount: row.monthly_amount === null ? null : Number(row.monthly_amount),
  };
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("*,admin_users(name)")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toLead);
}

export async function saveLead(raw: Record<string, unknown>): Promise<Lead> {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const values: Record<string, unknown> = {};
  if (!id || raw.company !== undefined) {
    const company = text(raw.company, 200);
    if (!company) throw new SalesError("MISSING_COMPANY", 400, "Falta el nombre de la empresa o persona");
    values.company = company;
  }
  for (const [key, column, max] of [
    ["contactName", "contact_name", 200],
    ["phone", "phone", 60],
    ["source", "source", 100],
    ["nextStep", "next_step", 300],
    ["lostReason", "lost_reason", 500],
    ["notes", "notes", 5000],
  ] as const) {
    if (raw[key] !== undefined) values[column] = text(raw[key], max);
  }
  if (raw.email !== undefined) {
    const email = text(raw.email, 200)?.toLowerCase() ?? null;
    if (email && !email.includes("@")) throw new SalesError("INVALID_EMAIL", 400, "El email no es válido");
    values.email = email;
  }
  if (raw.stage !== undefined) {
    if (!(LEAD_STAGES as readonly string[]).includes(raw.stage as string)) throw new SalesError("INVALID_STAGE", 400, "Etapa inválida");
    values.stage = raw.stage;
    values.stage_since = new Date().toISOString();
  }
  if (raw.quoteAmount !== undefined) values.quote_amount = amount(raw.quoteAmount);
  if (raw.monthlyAmount !== undefined) values.monthly_amount = amount(raw.monthlyAmount);
  if (raw.currency !== undefined) {
    if (raw.currency !== "ARS" && raw.currency !== "USD") throw new SalesError("INVALID_CURRENCY", 400, "Moneda inválida");
    values.currency = raw.currency;
  }
  if (raw.nextStepDate !== undefined) {
    if (raw.nextStepDate === null || raw.nextStepDate === "") values.next_step_date = null;
    else if (typeof raw.nextStepDate === "string" && DATE.test(raw.nextStepDate)) values.next_step_date = raw.nextStepDate;
    else throw new SalesError("INVALID_DATE", 400, "La fecha del próximo paso no es válida");
  }
  if (raw.ownerId !== undefined) values.owner_id = typeof raw.ownerId === "string" && raw.ownerId ? raw.ownerId : null;

  const supabase = getSupabaseAdmin();
  if (id && values.stage !== undefined) {
    // Solo cambia "desde cuándo" si de verdad cambió la etapa.
    const { data: current } = await supabase.from("leads").select("stage").eq("id", id).maybeSingle();
    if (current?.stage === values.stage) delete values.stage_since;
  }
  const query = id ? supabase.from("leads").update(values).eq("id", id) : supabase.from("leads").insert(values);
  const { data, error } = await query.select("*,admin_users(name)").single();
  if (error) throw error;
  return toLead(data as unknown as Row);
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("leads").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Prospecto ganado → cliente: lo crea con su KEY, el abono mensual y el primer período facturable
 * (`startPeriod`, YYYY-MM; si no viene, el mes que viene). Devuelve el id del cliente.
 */
export async function convertLead(id: string, raw: Record<string, unknown>): Promise<{ clientId: string; clientKey: string }> {
  const supabase = getSupabaseAdmin();
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!lead) throw new SalesError("NOT_FOUND", 404, "Prospecto no encontrado");
  if (lead.client_id) throw new SalesError("ALREADY_CLIENT", 409, "Este prospecto ya es cliente");

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const defaultPeriod = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const startPeriod = typeof raw.startPeriod === "string" && /^\d{4}-\d{2}$/.test(raw.startPeriod) ? raw.startPeriod : defaultPeriod;
  const clientKey = `magon_${randomBytes(12).toString("hex")}`;

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      client_key: clientKey,
      name: lead.company,
      email: lead.email,
      phone: lead.phone,
      monthly_amount: Number(lead.monthly_amount ?? 0),
      currency: lead.currency,
      active: true,
      notes: [lead.contact_name ? `Contacto: ${lead.contact_name}` : null, lead.notes].filter(Boolean).join("\n") || null,
      start_period: startPeriod,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const { error: updateError } = await supabase
    .from("leads")
    .update({ client_id: client.id, stage: "won", stage_since: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;
  return { clientId: client.id as string, clientKey };
}
