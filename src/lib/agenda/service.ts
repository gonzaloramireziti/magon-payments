import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/env";
import { notifyUser } from "@/lib/notify/service";
import type { Actor } from "@/lib/admin/access";

/**
 * Agenda (migración 015): reuniones, llamadas y recordatorios de cada usuario, opcionalmente atados
 * a un cliente, prospecto o ticket. Cuando llega la hora, el cron frecuente (/api/cron/uptime, cada
 * 10 min) le avisa por sus canales (WhatsApp, Discord, correo). Cada uno ve solo los suyos.
 */

export class AgendaError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const REMINDER_KINDS = ["reminder", "meeting", "call"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type Reminder = {
  id: string;
  title: string;
  kind: ReminderKind;
  due_at: string;
  client_id: string | null;
  client_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  ticket_id: string | null;
  ticket_number: number | null;
  notes: string | null;
  done_at: string | null;
};

type Row = Omit<Reminder, "client_name" | "lead_name" | "ticket_number"> & {
  user_id: string;
  clients: { name: string } | null;
  leads: { company: string } | null;
  tickets: { number: number } | null;
};

const SELECT = "id,user_id,title,kind,due_at,client_id,lead_id,ticket_id,notes,done_at,clients(name),leads(company),tickets(number)";

function toReminder(row: Row): Reminder {
  const { clients, leads, tickets, user_id: _user, ...rest } = row;
  return { ...rest, client_name: clients?.name ?? null, lead_name: leads?.company ?? null, ticket_number: tickets?.number ?? null };
}

function requireUser(actor: Actor): string {
  if (!actor.userId) throw new AgendaError("NEEDS_USER", 403, "El acceso de emergencia no tiene agenda: entrá con tu usuario.");
  return actor.userId;
}

/** Pendientes (vencidos incluidos) y hechos de los últimos 7 días. */
export async function listReminders(actor: Actor): Promise<Reminder[]> {
  const userId = requireUser(actor);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("reminders")
    .select(SELECT)
    .eq("user_id", userId)
    .or(`done_at.is.null,done_at.gte.${since}`)
    .order("due_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toReminder);
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function saveReminder(actor: Actor, raw: Record<string, unknown>): Promise<Reminder> {
  const userId = requireUser(actor);
  const id = optionalId(raw.id);
  const values: Record<string, unknown> = {};
  if (!id || raw.title !== undefined) {
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
    if (!title) throw new AgendaError("MISSING_TITLE", 400, "Falta qué hay que hacer");
    values.title = title;
  }
  if (!id || raw.dueAt !== undefined) {
    const due = typeof raw.dueAt === "string" ? Date.parse(raw.dueAt) : NaN;
    if (Number.isNaN(due)) throw new AgendaError("INVALID_DATE", 400, "La fecha y hora no son válidas");
    values.due_at = new Date(due).toISOString();
    values.notified_at = null;
  }
  if (raw.kind !== undefined) {
    if (!(REMINDER_KINDS as readonly string[]).includes(raw.kind as string)) throw new AgendaError("INVALID_KIND", 400, "Tipo inválido");
    values.kind = raw.kind;
  }
  if (raw.clientId !== undefined) values.client_id = optionalId(raw.clientId);
  if (raw.leadId !== undefined) values.lead_id = optionalId(raw.leadId);
  if (raw.ticketId !== undefined) values.ticket_id = optionalId(raw.ticketId);
  if (raw.notes !== undefined) values.notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 2000) || null : null;
  if (raw.done !== undefined) values.done_at = raw.done === true ? new Date().toISOString() : null;

  const supabase = getSupabaseAdmin();
  const query = id
    ? supabase.from("reminders").update(values).eq("id", id).eq("user_id", userId)
    : supabase.from("reminders").insert({ ...values, user_id: userId });
  const { data, error } = await query.select(SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw new AgendaError("NOT_FOUND", 404, "Ese recordatorio no existe");
  return toReminder(data as unknown as Row);
}

export async function deleteReminder(actor: Actor, id: string): Promise<void> {
  const userId = requireUser(actor);
  const { error } = await getSupabaseAdmin().from("reminders").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

const KIND_ICON: Record<ReminderKind, string> = { reminder: "⏰", meeting: "📅", call: "📞" };

/** Cron frecuente: avisa los recordatorios que llegaron a su hora (una sola vez cada uno). */
export async function runReminderAlerts(): Promise<{ sent: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reminders")
    .select(SELECT)
    .is("done_at", null)
    .is("notified_at", null)
    .lte("due_at", new Date().toISOString())
    .limit(100);
  if (error) throw error;
  let sent = 0;
  for (const row of (data ?? []) as unknown as Row[]) {
    const reminder = toReminder(row);
    const about = [reminder.client_name, reminder.lead_name, reminder.ticket_number ? `ticket #${reminder.ticket_number}` : null]
      .filter(Boolean)
      .join(" · ");
    const when = new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(reminder.due_at));
    const panel = notify.panelUrl ? `\n${notify.panelUrl.replace(/\/$/, "")}/admin#inicio` : "";
    if (
      await notifyUser(row.user_id, "reminder", {
        subject: `${KIND_ICON[reminder.kind]} ${reminder.title}`,
        text: `${KIND_ICON[reminder.kind]} ${reminder.title} (${when})${about ? `\n${about}` : ""}${reminder.notes ? `\n${reminder.notes}` : ""}${panel}`,
      })
    ) {
      sent += 1;
    }
    // Se marca aunque no tenga canales: igual lo ve en Mi día y no se reintenta cada 10 min.
    await supabase.from("reminders").update({ notified_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { sent };
}
