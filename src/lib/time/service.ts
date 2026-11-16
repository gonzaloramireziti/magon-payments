import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subscription } from "@/lib/env";
import { can } from "@/lib/admin/roles";
import type { Actor } from "@/lib/admin/access";

/**
 * Registro de horas: cada fila es un rato de trabajo de una persona sobre un ticket, un cliente
 * o tarea interna. Cada uno carga y corrige las suyas; con "time.all" se ven y corrigen las de todos.
 */

export type TimeEntry = {
  id: string;
  userId: string;
  userName: string | null;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  workDate: string;
  minutes: number | null;
  runningSince: string | null;
  note: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  ticket_id: string | null;
  client_id: string | null;
  work_date: string;
  minutes: number | null;
  running_since: string | null;
  note: string | null;
  created_at: string;
  admin_users: { name: string } | null;
  tickets: { number: number; title: string; client_id: string } | null;
  clients: { name: string } | null;
};

const SELECT =
  "id,user_id,ticket_id,client_id,work_date,minutes,running_since,note,created_at,admin_users(name),tickets(number,title,client_id),clients(name)";

export class TimeError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toEntry(row: Row): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.admin_users?.name ?? null,
    ticketId: row.ticket_id,
    ticketNumber: row.tickets?.number ?? null,
    ticketTitle: row.tickets?.title ?? null,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    workDate: row.work_date,
    minutes: row.minutes,
    runningSince: row.running_since,
    note: row.note,
    createdAt: row.created_at,
  };
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: subscription.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TimeError("INVALID_DATE", 400, "La fecha no es válida (AAAA-MM-DD)");
  }
  return value;
}

function parseMinutes(value: unknown): number {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    throw new TimeError("INVALID_MINUTES", 400, "Los minutos tienen que estar entre 1 y 1440 (24 h)");
  }
  return minutes;
}

function parseNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.trim().slice(0, 500);
  return note || null;
}

function requireUser(actor: Actor): string {
  if (!actor.userId) throw new TimeError("NEEDS_USER", 403, "El acceso de emergencia no carga horas: entrá con tu usuario.");
  return actor.userId;
}

/** Ticket y cliente de la carga: si viene ticket, el cliente sale de él. */
async function resolveTarget(rawTicket: unknown, rawClient: unknown): Promise<{ ticketId: string | null; clientId: string | null }> {
  const supabase = getSupabaseAdmin();
  if (typeof rawTicket === "string" && rawTicket) {
    const { data, error } = await supabase.from("tickets").select("id,client_id").eq("id", rawTicket).maybeSingle();
    if (error) throw error;
    if (!data) throw new TimeError("TICKET_NOT_FOUND", 404, "Ticket no encontrado");
    return { ticketId: data.id as string, clientId: data.client_id as string };
  }
  if (typeof rawClient === "string" && rawClient) {
    const { data, error } = await supabase.from("clients").select("id").eq("id", rawClient).maybeSingle();
    if (error) throw error;
    if (!data) throw new TimeError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
    return { ticketId: null, clientId: data.id as string };
  }
  return { ticketId: null, clientId: null };
}

async function loadOwned(id: string, actor: Actor): Promise<Row> {
  const { data, error } = await getSupabaseAdmin().from("time_entries").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as unknown as Row | null;
  if (!row) throw new TimeError("NOT_FOUND", 404, "Esa carga de horas no existe");
  if (row.user_id !== actor.userId && !can(actor.role, "time.all")) {
    throw new TimeError("FORBIDDEN", 403, "Solo podés tocar tus propias horas");
  }
  return row;
}

export type TimeFilter = { from?: unknown; to?: unknown; userId?: unknown; clientId?: unknown; ticketId?: unknown };

/** Horas de un rango. Sin "time.all", solo las propias (el filtro de usuario se ignora). */
export async function listEntries(actor: Actor, filter: TimeFilter): Promise<TimeEntry[]> {
  const all = can(actor.role, "time.all");
  const to = parseDate(filter.to, today());
  const from = parseDate(filter.from, to);
  let query = getSupabaseAdmin()
    .from("time_entries")
    .select(SELECT)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!all) query = query.eq("user_id", requireUser(actor));
  else if (typeof filter.userId === "string" && filter.userId) query = query.eq("user_id", filter.userId);
  if (typeof filter.clientId === "string" && filter.clientId) query = query.eq("client_id", filter.clientId);
  if (typeof filter.ticketId === "string" && filter.ticketId) query = query.eq("ticket_id", filter.ticketId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toEntry);
}

/** Horas de un ticket (de todo el equipo): las ve cualquiera que vea el ticket. */
export async function ticketTotal(ticketId: string): Promise<{ minutes: number; byUser: Array<{ name: string; minutes: number }> }> {
  const { data, error } = await getSupabaseAdmin()
    .from("time_entries")
    .select("minutes,admin_users(name)")
    .eq("ticket_id", ticketId)
    .not("minutes", "is", null);
  if (error) throw error;
  const byUser = new Map<string, number>();
  let minutes = 0;
  for (const row of (data ?? []) as unknown as Array<{ minutes: number; admin_users: { name: string } | null }>) {
    minutes += row.minutes;
    const name = row.admin_users?.name ?? "?";
    byUser.set(name, (byUser.get(name) ?? 0) + row.minutes);
  }
  return { minutes, byUser: [...byUser].map(([name, m]) => ({ name, minutes: m })).sort((a, b) => b.minutes - a.minutes) };
}

export async function runningEntry(actor: Actor): Promise<TimeEntry | null> {
  if (!actor.userId) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("time_entries")
    .select(SELECT)
    .eq("user_id", actor.userId)
    .not("running_since", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toEntry(data as unknown as Row) : null;
}

/** Carga a mano: { ticketId? | clientId?, minutes, date?, note? }. */
export async function addEntry(actor: Actor, body: Record<string, unknown>): Promise<TimeEntry> {
  const userId = requireUser(actor);
  const minutes = parseMinutes(body.minutes);
  const workDate = parseDate(body.date, today());
  const target = await resolveTarget(body.ticketId, body.clientId);
  const { data, error } = await getSupabaseAdmin()
    .from("time_entries")
    .insert({
      user_id: userId,
      ticket_id: target.ticketId,
      client_id: target.clientId,
      work_date: workDate,
      minutes,
      note: parseNote(body.note),
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return toEntry(data as unknown as Row);
}

/** Minutos entre el inicio del cronómetro y ahora (mínimo 1, máximo 24 h). */
export function elapsedMinutes(since: string, now = Date.now()): number {
  const minutes = Math.round((now - new Date(since).getTime()) / 60_000);
  return Math.min(1440, Math.max(1, minutes));
}

/** Frena el cronómetro que esté corriendo (si hay) y devuelve la carga cerrada. */
export async function stopTimer(actor: Actor): Promise<TimeEntry | null> {
  const running = await runningEntry(actor);
  if (!running?.runningSince) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("time_entries")
    .update({ minutes: elapsedMinutes(running.runningSince), running_since: null })
    .eq("id", running.id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return toEntry(data as unknown as Row);
}

/** Arranca el cronómetro. Si ya había uno corriendo, lo frena primero (se guarda ese rato). */
export async function startTimer(actor: Actor, body: Record<string, unknown>): Promise<{ entry: TimeEntry; stopped: TimeEntry | null }> {
  const userId = requireUser(actor);
  const target = await resolveTarget(body.ticketId, body.clientId);
  const stopped = await stopTimer(actor);
  const { data, error } = await getSupabaseAdmin()
    .from("time_entries")
    .insert({
      user_id: userId,
      ticket_id: target.ticketId,
      client_id: target.clientId,
      work_date: today(),
      running_since: new Date().toISOString(),
      note: parseNote(body.note),
    })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === "23505") throw new TimeError("ALREADY_RUNNING", 409, "Ya tenés un cronómetro corriendo");
    throw error;
  }
  return { entry: toEntry(data as unknown as Row), stopped };
}

/** Corrige minutos, fecha o nota de una carga cerrada. */
export async function updateEntry(actor: Actor, id: string, body: Record<string, unknown>): Promise<TimeEntry> {
  const row = await loadOwned(id, actor);
  const changes: Record<string, unknown> = {};
  if (body.minutes !== undefined) {
    if (row.running_since) throw new TimeError("RUNNING", 400, "Frená el cronómetro antes de corregir los minutos");
    changes.minutes = parseMinutes(body.minutes);
  }
  if (body.date !== undefined) changes.work_date = parseDate(body.date, row.work_date);
  if (body.note !== undefined) changes.note = parseNote(body.note);
  if (!Object.keys(changes).length) throw new TimeError("EMPTY_UPDATE", 400, "Nada para actualizar");
  const { data, error } = await getSupabaseAdmin().from("time_entries").update(changes).eq("id", id).select(SELECT).single();
  if (error) throw error;
  return toEntry(data as unknown as Row);
}

export async function deleteEntry(actor: Actor, id: string): Promise<void> {
  await loadOwned(id, actor);
  const { error } = await getSupabaseAdmin().from("time_entries").delete().eq("id", id);
  if (error) throw error;
}
