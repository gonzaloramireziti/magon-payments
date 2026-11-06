// Detecta cambios entre dos consultas del resumen de tickets. Sin React: se prueba suelto.

export type Summary = { id: string; number: number; title: string; client_name: string; updated_at: string };

export type WatchResult<T extends Summary> = {
  // Hubo altas, bajas o modificaciones: hay que recargar los tickets completos.
  changed: boolean;
  // Tickets que no estaban en la consulta anterior.
  added: T[];
};

export function diffSummaries<T extends Summary>(previous: Map<string, string> | null, next: T[]): WatchResult<T> {
  // Primera consulta: es la línea de base, nada es "nuevo".
  if (!previous) return { changed: false, added: [] };
  const added = next.filter((ticket) => !previous.has(ticket.id));
  const changed =
    added.length > 0 ||
    next.length !== previous.size ||
    next.some((ticket) => previous.get(ticket.id) !== ticket.updated_at);
  return { changed, added };
}

export function snapshot(tickets: Summary[]): Map<string, string> {
  return new Map(tickets.map((ticket) => [ticket.id, ticket.updated_at]));
}

// "(3) Magon · Panel" mientras haya tickets nuevos sin ver.
export function titleWithCount(base: string, unseen: number): string {
  return unseen > 0 ? `(${unseen}) ${base}` : base;
}
