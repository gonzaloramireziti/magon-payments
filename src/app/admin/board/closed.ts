// Métricas y filtro por período de los tickets cerrados. Sin React: se prueba suelto.
import type { Ticket } from "../lib/tickets";

export type ClosedKind = "all" | "done" | "discarded";
export type Period = "7" | "30" | "90" | "all";

const DAY = 24 * 60 * 60 * 1000;

function closedAt(ticket: Pick<Ticket, "resolved_at" | "updated_at">): number {
  return new Date(ticket.resolved_at ?? ticket.updated_at).getTime();
}

export function inPeriod(ticket: Pick<Ticket, "resolved_at" | "updated_at">, period: Period, now = Date.now()): boolean {
  if (period === "all") return true;
  return now - closedAt(ticket) <= Number(period) * DAY;
}

export function closedStats(tickets: Array<Pick<Ticket, "status" | "type" | "created_at" | "resolved_at" | "updated_at">>) {
  const done = tickets.filter((t) => t.status === "done");
  const durations = done.map((t) => (closedAt(t) - new Date(t.created_at).getTime()) / DAY).filter((d) => d >= 0);
  return {
    done: done.length,
    discarded: tickets.filter((t) => t.status === "discarded").length,
    bugs: done.filter((t) => t.type === "bug").length,
    features: done.filter((t) => t.type === "feature").length,
    avgDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  };
}
