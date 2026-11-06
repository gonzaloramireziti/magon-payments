// Filtros y orden del tablero. Sin React ni Mantine, para poder probarlos sueltos.
import { normalizeText } from "../lib/format";
import { URGENCY, type Ticket, type TicketType, type TicketUrgency } from "../lib/tickets";

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

// Columna "Resuelto": sin "ver cerrados" muestra solo lo cerrado en las últimas 2 semanas.
export function recentlyResolved(ticket: Ticket, now = Date.now()): boolean {
  const when = ticket.resolved_at ?? ticket.updated_at;
  return now - new Date(when).getTime() <= 14 * 24 * 60 * 60 * 1000;
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
