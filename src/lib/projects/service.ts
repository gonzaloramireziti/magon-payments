import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/admin/roles";
import type { Actor } from "@/lib/admin/access";

/**
 * Proyectos (migración 015): desarrollos grandes de un cliente, con etapas, fecha de entrega,
 * horas estimadas y presupuesto. Los tickets se asocian al proyecto: su avance y sus horas suman.
 * Todos ven los proyectos; el presupuesto solo quien tiene acceso a la plata. Crear y editar el
 * proyecto requiere "manage"; marcar etapas lo puede hacer cualquiera del equipo.
 */

export class ProjectError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const PROJECT_STATUSES = ["planning", "in_progress", "paused", "delivered", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Milestone = { id: string; title: string; due_date: string | null; done_at: string | null; position: number };

export type Project = {
  id: string;
  client_id: string;
  client_name: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string | null;
  owner_name: string | null;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  budget: number | null;
  currency: "ARS" | "USD";
  milestones: Milestone[];
  tickets: { total: number; closed: number };
  minutes: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function date(value: unknown, label: string): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value === "string" && DATE.test(value)) return value;
  throw new ProjectError("INVALID_DATE", 400, `La fecha de ${label} no es válida`);
}

function amount(value: unknown, label: string): number | null {
  if (value === null || value === "" || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ProjectError("INVALID_NUMBER", 400, `${label} no es válido`);
  return n;
}

type Row = Omit<Project, "client_name" | "owner_name" | "milestones" | "tickets" | "minutes" | "budget" | "estimated_hours"> & {
  budget: number | string | null;
  estimated_hours: number | string | null;
  clients: { name: string } | null;
  admin_users: { name: string } | null;
  project_milestones: Milestone[] | null;
};

export async function listProjects(actor: Actor): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select("*,clients(name),admin_users(name),project_milestones(id,title,due_date,done_at,position)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);

  // Avance (tickets) y horas de cada proyecto.
  const tickets = new Map<string, { total: number; closed: number; ids: string[] }>();
  if (ids.length) {
    const { data: ticketRows } = await supabase.from("tickets").select("id,project_id,status").in("project_id", ids);
    for (const t of ticketRows ?? []) {
      const entry = tickets.get(t.project_id as string) ?? { total: 0, closed: 0, ids: [] };
      entry.total += 1;
      if (t.status === "done" || t.status === "discarded") entry.closed += 1;
      entry.ids.push(t.id as string);
      tickets.set(t.project_id as string, entry);
    }
  }
  const minutes = new Map<string, number>();
  const allTicketIds = [...tickets.values()].flatMap((t) => t.ids);
  if (allTicketIds.length) {
    const { data: timeRows, error: timeError } = await supabase
      .from("time_entries")
      .select("ticket_id,minutes")
      .in("ticket_id", allTicketIds)
      .not("minutes", "is", null);
    if (!timeError) {
      const projectOf = new Map<string, string>();
      for (const [projectId, t] of tickets) for (const id of t.ids) projectOf.set(id, projectId);
      for (const row of timeRows ?? []) {
        const projectId = projectOf.get(row.ticket_id as string);
        if (projectId) minutes.set(projectId, (minutes.get(projectId) ?? 0) + Number(row.minutes));
      }
    }
  }

  const money = can(actor.role, "finance");
  return rows.map((row) => {
    const { clients, admin_users, project_milestones, ...rest } = row;
    const t = tickets.get(row.id);
    return {
      ...rest,
      client_name: clients?.name ?? null,
      owner_name: admin_users?.name ?? null,
      estimated_hours: row.estimated_hours === null ? null : Number(row.estimated_hours),
      budget: money && row.budget !== null ? Number(row.budget) : null,
      milestones: (project_milestones ?? []).slice().sort((a, b) => a.position - b.position),
      tickets: { total: t?.total ?? 0, closed: t?.closed ?? 0 },
      minutes: minutes.get(row.id) ?? 0,
    };
  });
}

export async function saveProject(raw: Record<string, unknown>): Promise<string> {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const values: Record<string, unknown> = {};
  if (!id || raw.name !== undefined) {
    const name = text(raw.name, 200);
    if (!name) throw new ProjectError("MISSING_NAME", 400, "Falta el nombre del proyecto");
    values.name = name;
  }
  if (!id || raw.clientId !== undefined) {
    if (typeof raw.clientId !== "string" || !raw.clientId) throw new ProjectError("MISSING_CLIENT", 400, "Elegí el cliente");
    values.client_id = raw.clientId;
  }
  if (raw.description !== undefined) values.description = text(raw.description, 5000);
  if (raw.status !== undefined) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(raw.status as string)) throw new ProjectError("INVALID_STATUS", 400, "Estado inválido");
    values.status = raw.status;
  }
  if (raw.ownerId !== undefined) values.owner_id = typeof raw.ownerId === "string" && raw.ownerId ? raw.ownerId : null;
  if (raw.startDate !== undefined) values.start_date = date(raw.startDate, "inicio");
  if (raw.dueDate !== undefined) values.due_date = date(raw.dueDate, "entrega");
  if (raw.estimatedHours !== undefined) values.estimated_hours = amount(raw.estimatedHours, "Las horas estimadas");
  if (raw.budget !== undefined) values.budget = amount(raw.budget, "El presupuesto");
  if (raw.currency !== undefined) {
    if (raw.currency !== "ARS" && raw.currency !== "USD") throw new ProjectError("INVALID_CURRENCY", 400, "Moneda inválida");
    values.currency = raw.currency;
  }
  const supabase = getSupabaseAdmin();
  const query = id ? supabase.from("projects").update(values).eq("id", id) : supabase.from("projects").insert(values);
  const { data, error } = await query.select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** Etapas: { projectId, title, dueDate? } crea; { id, done? , title?, dueDate? } edita; { id, delete: true } borra. */
export async function saveMilestone(raw: Record<string, unknown>, canEdit: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const structural = !id || raw.title !== undefined || raw.dueDate !== undefined || raw.delete === true;
  if (structural && !canEdit) throw new ProjectError("FORBIDDEN", 403, "Solo un administrador cambia las etapas; vos podés marcarlas");
  if (id && raw.delete === true) {
    const { error } = await supabase.from("project_milestones").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  if (!id) {
    const title = text(raw.title, 200);
    if (!title) throw new ProjectError("MISSING_TITLE", 400, "Falta el nombre de la etapa");
    if (typeof raw.projectId !== "string" || !raw.projectId) throw new ProjectError("MISSING_PROJECT", 400, "Falta el proyecto");
    const { error } = await supabase
      .from("project_milestones")
      .insert({ project_id: raw.projectId, title, due_date: date(raw.dueDate, "la etapa"), position: Date.now() });
    if (error) throw error;
    return;
  }
  const values: Record<string, unknown> = {};
  if (raw.title !== undefined) values.title = text(raw.title, 200);
  if (raw.dueDate !== undefined) values.due_date = date(raw.dueDate, "la etapa");
  if (raw.done !== undefined) values.done_at = raw.done === true ? new Date().toISOString() : null;
  const { error } = await supabase.from("project_milestones").update(values).eq("id", id);
  if (error) throw error;
}

/** Asocia (o desasocia con null) un ticket a un proyecto. */
export async function linkTicket(ticketId: string, projectId: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin().from("tickets").update({ project_id: projectId }).eq("id", ticketId);
  if (error) throw error;
}
