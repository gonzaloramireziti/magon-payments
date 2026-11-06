import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findClientByKey } from "@/lib/subscription/service";
import type { AdminSession } from "@/lib/admin/auth";
import { notifyEvent } from "@/lib/notify/service";
import {
  allowedTypes,
  isTicketStatus,
  isTicketUrgency,
  LIMITS,
  normalizeChannel,
  normalizeComment,
  normalizeLabels,
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
  assignee_id: string | null;
  labels: string[];
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
  const created = { id: data.id as string, number: Number(data.number) };
  await notifyEvent("new_ticket", {
    ...created,
    title: input.title,
    type: input.type,
    urgency: input.urgency,
    client_name: client.name,
  });
  return created;
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
  assignee_name: string | null;
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

export type TicketSummary = {
  id: string;
  number: number;
  title: string;
  type: TicketType;
  status: TicketStatus;
  client_name: string;
  created_at: string;
  updated_at: string;
};

// Versión liviana para consultar seguido: sin capturas firmadas ni textos largos.
export async function listTicketSummaries(): Promise<TicketSummary[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .select("id,number,title,type,status,created_at,updated_at,clients(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { clients, ...ticket } = row as unknown as Omit<TicketSummary, "client_name"> & {
      clients: { name: string } | null;
    };
    return { ...ticket, client_name: clients?.name ?? "-" };
  });
}

export async function listAdminTickets(includeDiscarded: boolean): Promise<AdminTicket[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tickets")
    .select("*, clients(name), assignee:admin_users(name)")
    .order("position", { ascending: true })
    .limit(500);
  if (!includeDiscarded) query = query.neq("status", "discarded");
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => {
      const { clients, assignee, ...ticket } = row as TicketRow & {
        clients: { name: string } | null;
        assignee: { name: string } | null;
      };
      return {
        ...ticket,
        labels: ticket.labels ?? [],
        client_name: clients?.name ?? "-",
        assignee_name: assignee?.name ?? null,
        attachment_urls: await signAttachments(ticket.attachments),
      };
    })
  );
}

async function ticketForMessage(id: string) {
  const { data } = await getSupabaseAdmin()
    .from("tickets")
    .select("id,number,title,type,urgency,assignee_id,clients(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const clients = data.clients as unknown as { name: string } | null;
  return {
    ticket: {
      id: data.id as string,
      number: Number(data.number),
      title: data.title as string,
      type: data.type as TicketType,
      urgency: data.urgency as string,
      client_name: clients?.name ?? "-",
    },
    assigneeId: (data.assignee_id as string | null) ?? null,
  };
}

type ActivityKind = "comment" | "status" | "assignee" | "urgency" | "labels";

async function recordActivity(
  ticketId: string,
  actor: AdminSession,
  kind: ActivityKind,
  body: string | null,
  meta: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ticket_activity").insert({
    ticket_id: ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    kind,
    body,
    meta,
  });
  if (error) console.error("[tickets] no se pudo registrar la actividad", error);
}

async function userName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await getSupabaseAdmin().from("admin_users").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function updateTicket(
  id: string,
  raw: Record<string, unknown>,
  actor: AdminSession
): Promise<TicketRow> {
  const supabase = getSupabaseAdmin();
  const { data: current, error: readError } = await supabase
    .from("tickets")
    .select("status,resolved_at,urgency,assignee_id,labels")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new TicketError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");

  const update: Record<string, unknown> = {};
  const events: Array<{ kind: ActivityKind; meta: Record<string, unknown> }> = [];

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
    if (raw.status !== current.status) events.push({ kind: "status", meta: { from: current.status, to: raw.status } });
  }
  if (raw.urgency !== undefined) {
    if (!isTicketUrgency(raw.urgency)) {
      throw new TicketError("INVALID_URGENCY", 400, "Urgencia inválida");
    }
    update.urgency = raw.urgency;
    if (raw.urgency !== current.urgency) events.push({ kind: "urgency", meta: { from: current.urgency, to: raw.urgency } });
  }
  if (raw.assigneeId !== undefined) {
    const assigneeId = typeof raw.assigneeId === "string" && raw.assigneeId !== "" ? raw.assigneeId : null;
    const name = await userName(assigneeId);
    if (assigneeId && !name) throw new TicketError("INVALID_ASSIGNEE", 400, "Ese usuario no existe");
    update.assignee_id = assigneeId;
    if (assigneeId !== current.assignee_id) {
      events.push({ kind: "assignee", meta: { from: await userName(current.assignee_id as string | null), to: name } });
    }
  }
  if (raw.labels !== undefined) {
    const labels = normalizeLabels(raw.labels);
    update.labels = labels;
    const before = ((current.labels as string[] | null) ?? []).slice().sort().join(",");
    if (labels.slice().sort().join(",") !== before) events.push({ kind: "labels", meta: { to: labels } });
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
  for (const event of events) await recordActivity(id, actor, event.kind, null, event.meta);
  const newAssignee = update.assignee_id as string | null | undefined;
  if (newAssignee && newAssignee !== current.assignee_id && newAssignee !== actor.userId) {
    const info = await ticketForMessage(id);
    if (info) await notifyEvent("assigned", info.ticket, { onlyUserId: newAssignee, actorName: actor.name });
  }
  return data as TicketRow;
}

export type TicketActivity = {
  id: string;
  kind: ActivityKind;
  authorName: string | null;
  body: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export async function listActivity(ticketId: string): Promise<TicketActivity[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ticket_activity")
    .select("id,kind,author_name,body,meta,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as ActivityKind,
    authorName: (row.author_name as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}

export async function addComment(ticketId: string, raw: unknown, actor: AdminSession): Promise<void> {
  const body = normalizeComment(raw);
  if (!body) throw new TicketError("EMPTY_COMMENT", 400, "El comentario está vacío");
  const { data, error } = await getSupabaseAdmin().from("tickets").select("id").eq("id", ticketId).maybeSingle();
  if (error) throw error;
  if (!data) throw new TicketError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");
  const { error: insertError } = await getSupabaseAdmin().from("ticket_activity").insert({
    ticket_id: ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    kind: "comment",
    body,
  });
  if (insertError) throw insertError;
  const info = await ticketForMessage(ticketId);
  if (info?.assigneeId && info.assigneeId !== actor.userId) {
    await notifyEvent("comment", info.ticket, { onlyUserId: info.assigneeId, actorName: actor.name, comment: body });
  }
}
