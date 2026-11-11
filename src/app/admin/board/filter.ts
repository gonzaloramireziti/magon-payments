// Filtros y orden del tablero. Sin React ni Mantine, para poder probarlos sueltos.
import { normalizeText } from "../lib/format";
import { URGENCY, type Ticket, type TicketStatus, type TicketType, type TicketUrgency } from "../lib/tickets";

export type Scope = "all" | "mine" | "unassigned" | `user:${string}`;

export type BoardFilters = {
  search: string;
  clientId: string | null;
  type: TicketType | null;
  urgency: TicketUrgency | null;
  labels: string[];
  scope: Scope;
  showClosed: boolean;
};

export const EMPTY_FILTERS: BoardFilters = {
  search: "",
  clientId: null,
  type: null,
  urgency: null,
  labels: [],
  scope: "all",
  showClosed: false,
};

// Cuántos filtros hay aplicados además del buscador (para el contador del botón en mobile).
export function activeFilterCount(filters: BoardFilters): number {
  return (
    (filters.clientId ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.urgency ? 1 : 0) +
    (filters.labels.length ? 1 : 0) +
    (filters.scope !== "all" ? 1 : 0) +
    (filters.showClosed ? 1 : 0)
  );
}

function haystack(ticket: Ticket): string {
  return normalizeText(
    [
      `#${ticket.number}`,
      ticket.title,
      ticket.description,
      ticket.expected ?? "",
      ticket.actual ?? "",
      ticket.client_name,
      ticket.reporter_name ?? "",
      ticket.reporter_email ?? "",
      ticket.assignee_name ?? "",
      ticket.labels.join(" "),
    ].join(" ")
  );
}

// Cada palabra del buscador tiene que aparecer en algún campo ("recibo 910" encuentra
// "No se genera el recibo del contrato 910"). "#12" busca por número exacto.
export function matchesSearch(ticket: Ticket, search: string): boolean {
  const query = search.trim();
  if (!query) return true;
  const byNumber = /^#?(\d+)$/.exec(query);
  if (byNumber) return String(ticket.number) === byNumber[1] || haystack(ticket).includes(query);
  const text = haystack(ticket);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export function applyFilters(tickets: Ticket[], filters: BoardFilters, meId: string | null): Ticket[] {
  return tickets.filter((ticket) => {
    if (filters.clientId && ticket.client_id !== filters.clientId) return false;
    if (filters.type && ticket.type !== filters.type) return false;
    if (filters.urgency && ticket.urgency !== filters.urgency) return false;
    if (filters.labels.length && !filters.labels.every((label) => ticket.labels.includes(label))) return false;
    if (filters.scope === "mine" && (!meId || ticket.assignee_id !== meId)) return false;
    if (filters.scope === "unassigned" && ticket.assignee_id) return false;
    if (filters.scope.startsWith("user:") && ticket.assignee_id !== filters.scope.slice(5)) return false;
    return matchesSearch(ticket, filters.search);
  });
}

// Columna "Resuelto": muestra solo lo cerrado hace poco. Lo demás vive en Terminados.
export type ResolvedWindow = "today" | "3" | "7";
export const RESOLVED_WINDOWS: Array<{ value: ResolvedWindow; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "3", label: "3 días" },
  { value: "7", label: "7 días" },
];

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function resolvedWithin(
  ticket: Pick<Ticket, "resolved_at" | "updated_at">,
  window: ResolvedWindow,
  now = Date.now()
): boolean {
  const when = new Date(ticket.resolved_at ?? ticket.updated_at).getTime();
  if (window === "today") return when >= startOfLocalDay(now);
  return now - when <= Number(window) * 24 * 60 * 60 * 1000;
}

// Hasta cuándo se banca un ticket en cada columna antes de marcarlo (en horas).
const AGING_HOURS: Partial<Record<TicketStatus, { warn: number; late: number }>> = {
  new: { warn: 24, late: 72 },
  analysis: { warn: 72, late: 168 },
  ready: { warn: 72, late: 168 },
  in_progress: { warn: 72, late: 168 },
  testing: { warn: 48, late: 120 },
};

export type Aging = "ok" | "warn" | "late";

export function agingLevel(status: TicketStatus, since: string, now = Date.now()): Aging {
  const limits = AGING_HOURS[status];
  if (!limits) return "ok";
  const hours = (now - new Date(since).getTime()) / 3_600_000;
  if (hours >= limits.late) return "late";
  if (hours >= limits.warn) return "warn";
  return "ok";
}

export function humanDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 día" : `${days} días`;
}

/** Cuánto tardó en resolverse (desde que lo cargó el cliente). */
export function resolutionTime(ticket: Pick<Ticket, "created_at" | "resolved_at">): string | null {
  if (!ticket.resolved_at) return null;
  return humanDuration(new Date(ticket.resolved_at).getTime() - new Date(ticket.created_at).getTime());
}

export type SortKey = "number" | "urgency" | "created" | "updated" | "client";

export function sortTickets(tickets: Ticket[], key: SortKey, desc: boolean): Ticket[] {
  const factor = desc ? -1 : 1;
  return [...tickets].sort((a, b) => {
    let diff = 0;
    if (key === "number") diff = a.number - b.number;
    if (key === "urgency") diff = URGENCY[a.urgency].rank - URGENCY[b.urgency].rank;
    if (key === "created") diff = a.created_at.localeCompare(b.created_at);
    if (key === "updated") diff = a.updated_at.localeCompare(b.updated_at);
    if (key === "client") diff = a.client_name.localeCompare(b.client_name);
    return diff * factor || b.number - a.number;
  });
}

// Posición entre dos vecinos al soltar una tarjeta; al final, una más que el último.
export function positionBetween(before?: { position: number }, after?: { position: number }): number {
  if (before && after) return (before.position + after.position) / 2;
  if (after) return after.position - 1;
  if (before) return before.position + 1;
  return 0;
}

export function allLabels(tickets: Ticket[]): string[] {
  return Array.from(new Set(tickets.flatMap((ticket) => ticket.labels))).sort();
}
