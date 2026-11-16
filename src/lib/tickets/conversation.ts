import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";
import { notifyEvent, notifyReporterMessage } from "@/lib/notify/service";
import { LIMITS, type TicketStatus } from "@/lib/tickets/policy";
import {
  activeClientForKey,
  TicketError,
  ticketForMessage,
  updateTicket,
} from "@/lib/tickets/service";

/**
 * Conversación con el cliente en un ticket (migración 013).
 *
 * - El equipo le escribe desde el panel ("to_client"). Con `ask`, el ticket pasa a «Esperando al
 *   cliente» (waiting). Al cliente le llega por correo (si dejó email) y lo ve en «Mis reportes».
 * - El cliente responde desde «Mis reportes» ("client_reply"). Si el ticket estaba esperando o se
 *   había cerrado sin cambios (descartado por falta de información o dudas), vuelve a «En análisis».
 */

// Cuántas respuestas puede mandar un cliente por ticket y por hora (el widget es público).
const REPLIES_PER_HOUR = 10;

function normalizeMessage(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, LIMITS.text) : "";
}

export async function messageClient(
  ticketId: string,
  raw: unknown,
  ask: boolean,
  actor: AdminSession
): Promise<{ emailed: boolean; status: TicketStatus }> {
  const body = normalizeMessage(raw);
  if (!body) throw new TicketError("EMPTY_MESSAGE", 400, "El mensaje está vacío");
  const supabase = getSupabaseAdmin();
  const { data: ticket, error } = await supabase.from("tickets").select("id,status").eq("id", ticketId).maybeSingle();
  if (error) throw error;
  if (!ticket) throw new TicketError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");

  const { error: insertError } = await supabase.from("ticket_activity").insert({
    ticket_id: ticketId,
    author_id: actor.userId,
    author_name: actor.name,
    kind: "to_client",
    body,
    meta: { ask },
  });
  if (insertError) {
    if (insertError.code === "23514") {
      throw new TicketError("CONVERSATION_UNAVAILABLE", 503, "Falta correr la migración 013 para escribirle al cliente");
    }
    throw insertError;
  }

  let status = ticket.status as TicketStatus;
  if (ask && status !== "waiting") {
    await updateTicket(ticketId, { status: "waiting" }, actor);
    status = "waiting";
  }

  const info = await ticketForMessage(ticketId);
  const emailed = info ? await notifyReporterMessage(info.ticket, info.reporter, body, ask) : false;
  return { emailed, status };
}

/** El reportante tiene que ser el mismo que cargó el ticket (si el ticket lo registró). */
function sameReporter(
  ticket: { reporter_ref: string | null; reporter_email: string | null },
  reporter: { ref?: string | null; email?: string | null }
): boolean {
  if (ticket.reporter_ref) return reporter.ref?.trim() === ticket.reporter_ref;
  if (ticket.reporter_email) return reporter.email?.trim().toLowerCase() === ticket.reporter_email.toLowerCase();
  return true;
}

export async function clientReply(
  clientKey: string,
  raw: Record<string, unknown>
): Promise<{ status: TicketStatus }> {
  const { client } = await activeClientForKey(clientKey);
  const number = Number(raw.number);
  if (!Number.isInteger(number) || number <= 0) throw new TicketError("INVALID_NUMBER", 400, "Falta el número de reporte");
  const body = normalizeMessage(raw.body);
  if (!body) throw new TicketError("EMPTY_MESSAGE", 400, "Escribí tu respuesta");
  const reporter = {
    ref: typeof raw.reporterRef === "string" ? raw.reporterRef : null,
    email: typeof raw.reporterEmail === "string" ? raw.reporterEmail : null,
  };

  const supabase = getSupabaseAdmin();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("id,status,reporter_name,reporter_ref,reporter_email,assignee_id")
    .eq("client_id", client.id)
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  // Mismo mensaje si no existe o no es suyo: no se confirma qué números existen.
  if (!ticket || !sameReporter(ticket, reporter)) {
    throw new TicketError("TICKET_NOT_FOUND", 404, "No encontramos ese reporte");
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ticket_activity")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticket.id)
    .eq("kind", "client_reply")
    .gte("created_at", since);
  if ((count ?? 0) >= REPLIES_PER_HOUR) {
    throw new TicketError("TOO_MANY_REPLIES", 429, "Mandaste muchas respuestas seguidas. Probá de nuevo en un rato.");
  }

  const name =
    (typeof raw.reporterName === "string" && raw.reporterName.trim().slice(0, LIMITS.short)) ||
    (ticket.reporter_name as string | null) ||
    "Cliente";
  const actor: AdminSession = { userId: null, name, email: null };
  const { error: insertError } = await supabase.from("ticket_activity").insert({
    ticket_id: ticket.id,
    author_id: null,
    author_name: name,
    kind: "client_reply",
    body,
  });
  if (insertError) {
    if (insertError.code === "23514") {
      throw new TicketError("CONVERSATION_UNAVAILABLE", 503, "Las respuestas todavía no están habilitadas");
    }
    throw insertError;
  }

  // Si esperábamos su respuesta o lo habíamos cerrado sin cambios, vuelve a análisis.
  let status = ticket.status as TicketStatus;
  if (status === "waiting" || status === "discarded") {
    await updateTicket(ticket.id as string, { status: "analysis" }, actor);
    status = "analysis";
  }

  const info = await ticketForMessage(ticket.id as string);
  if (info) {
    await notifyEvent("comment", info.ticket, {
      ...(info.assigneeId ? { onlyUserId: info.assigneeId } : {}),
      actorName: `${name} (cliente)`,
      comment: body,
    });
  }
  return { status };
}
