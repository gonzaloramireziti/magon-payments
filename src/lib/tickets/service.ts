import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findClientByKey } from "@/lib/subscription/service";
import {
  allowedTypes,
  isTicketStatus,
  isTicketUrgency,
  LIMITS,
  normalizeChannel,
  parsePolicy,
  resolvedAtFor,
  validateAttachments,
  validateTicketInput,
  type TicketStatus,
  type TicketType,
} from "@/lib/tickets/policy";

const BUCKET = "ticket-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type TicketAttachment = { path: string; name: string; type: string; size: number };

export type TicketRow = {
  id: string;
  number: number;
  client_id: string;
  channel: string;
  type: TicketType;
  title: string;
  description: string;
  expected: string | null;
  actual: string | null;
  urgency: string;
  status: TicketStatus;
  position: number;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_ref: string | null;
  page_url: string | null;
  user_agent: string | null;
  app_version: string | null;
  attachments: TicketAttachment[];
  internal_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

// Error de PostgREST/Postgres cuando la tabla no existe (migración 003 sin correr).
export function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

export class TicketError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function activeClientForKey(clientKey: string) {
  const client = await findClientByKey(clientKey);
  if (!client) throw new TicketError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
  if (!client.active) throw new TicketError("CLIENT_INACTIVE", 403, "Cliente inactivo");
  const policy = parsePolicy((client as { support_policy?: unknown }).support_policy);
  return { client, policy };
}

export async function getSupportConfig(clientKey: string, channelRaw: unknown) {
  const { client, policy } = await activeClientForKey(clientKey);
  const channel = normalizeChannel(channelRaw);
  return { clientName: client.name, channel, types: allowedTypes(policy, channel) };
}

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

async function uploadAttachments(clientId: string, files: File[]): Promise<TicketAttachment[]> {
  if (files.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const uploaded: TicketAttachment[] = [];
  for (const file of files) {
    const path = `${clientId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (error) throw error;
    uploaded.push({ path, name: file.name.slice(0, 120), type: file.type, size: file.size });
  }
  return uploaded;
}

async function assertBelowRateLimit(clientId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= LIMITS.ticketsPerHour) {
    throw new TicketError(
      "RATE_LIMITED",
      429,
      "Se cargaron demasiados reportes en la última hora. Probá de nuevo más tarde."
    );
  }
}

export async function createTicket(
  clientKey: string,
  raw: Record<string, unknown>,
  files: File[]
): Promise<{ id: string; number: number }> {
  const { client, policy } = await activeClientForKey(clientKey);

  const validation = validateTicketInput(raw, policy);
  if (!validation.ok) throw new TicketError(validation.code, 400, validation.message);

  const attachmentError = validateAttachments(files);
  if (attachmentError) throw new TicketError("INVALID_ATTACHMENTS", 400, attachmentError);

  await assertBelowRateLimit(client.id);

  const input = validation.value;
  const attachments = await uploadAttachments(client.id, files);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      client_id: client.id,
      channel: input.channel,
      type: input.type,
      title: input.title,
      description: input.description,
      expected: input.expected,
      actual: input.actual,
      urgency: input.urgency,
      status: "new",
      // Los nuevos van arriba de la columna.
      position: -Date.now(),
      reporter_name: input.reporterName,
      reporter_email: input.reporterEmail,
      reporter_ref: input.reporterRef,
      page_url: input.pageUrl,
      user_agent: input.userAgent,
      app_version: input.appVersion,
      attachments,
    })
    .select("id,number")
    .single();
  if (error) throw error;
  return { id: data.id as string, number: Number(data.number) };
}

export type PublicTicket = {
  number: number;
  type: TicketType;
  title: string;
  status: TicketStatus;
  createdAt: string;
  resolvedAt: string | null;
};

// Lo que ve el cliente de sus propios reportes: sin descripción ni notas internas, porque la
// KEY viaja en el front y cualquiera con ella podría leerlos.
export async function listClientTickets(clientKey: string): Promise<PublicTicket[]> {
  const { client } = await activeClientForKey(clientKey);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select("number,type,title,status,created_at,resolved_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    number: Number(row.number),
    type: row.type as TicketType,
    title: row.title as string,
    status: row.status as TicketStatus,
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  }));
}

export type AdminTicket = TicketRow & {
  client_name: string;
  attachment_urls: Array<TicketAttachment & { url: string | null }>;
};

async function signAttachments(
  attachments: TicketAttachment[]
): Promise<Array<TicketAttachment & { url: string | null }>> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      attachments.map((attachment) => attachment.path),
      SIGNED_URL_TTL_SECONDS
    );
  return attachments.map((attachment, index) => ({
    ...attachment,
    url: data?.[index]?.signedUrl ?? null,
  }));
}

export async function listAdminTickets(includeDiscarded: boolean): Promise<AdminTicket[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tickets")
    .select("*, clients(name)")
    .order("position", { ascending: true })
    .limit(500);
  if (!includeDiscarded) query = query.neq("status", "discarded");
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => {
      const { clients, ...ticket } = row as TicketRow & { clients: { name: string } | null };
      return {
        ...ticket,
        client_name: clients?.name ?? "-",
        attachment_urls: await signAttachments(ticket.attachments),
      };
    })
  );
}

export async function updateTicket(id: string, raw: Record<string, unknown>): Promise<TicketRow> {
  const supabase = getSupabaseAdmin();
  const { data: current, error: readError } = await supabase
    .from("tickets")
    .select("status,resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new TicketError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");

  const update: Record<string, unknown> = {};
  if (raw.status !== undefined) {
    if (!isTicketStatus(raw.status)) {
      throw new TicketError("INVALID_STATUS", 400, "Estado inválido");
    }
    update.status = raw.status;
    update.resolved_at = resolvedAtFor(
      raw.status,
      (current.resolved_at as string | null) ?? null,
      new Date().toISOString()
    );
  }
  if (raw.urgency !== undefined) {
    if (!isTicketUrgency(raw.urgency)) {
      throw new TicketError("INVALID_URGENCY", 400, "Urgencia inválida");
    }
    update.urgency = raw.urgency;
  }
  if (raw.position !== undefined) {
    const position = Number(raw.position);
    if (!Number.isFinite(position)) throw new TicketError("INVALID_POSITION", 400, "Posición inválida");
    update.position = position;
  }
  if (typeof raw.internalNotes === "string" || raw.internalNotes === null) {
    update.internal_notes = raw.internalNotes;
  }
  if (Object.keys(update).length === 0) {
    throw new TicketError("EMPTY_UPDATE", 400, "Nada para actualizar");
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TicketRow;
}
