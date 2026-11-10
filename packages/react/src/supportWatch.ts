// Seguimiento de "Mis reportes": detecta los cambios de estado para avisarle al usuario sin que
// tenga que abrir la ventana. Sin React: se prueba suelto.

export type WatchedTicket = { number: number; title: string; status: string };
export type StatusChange = { number: number; title: string; from: string; to: string };

/** Lo que se guarda por usuario: el último estado visto de cada reporte y los suyos cargados acá. */
export type WatchState = { statuses: Record<string, string>; mine: number[] };

const EMPTY: WatchState = { statuses: {}, mine: [] };

export function storageKey(clientKey: string, reporter: { id?: string | number | null; email?: string | null } | undefined): string {
  const who = reporter?.id != null && String(reporter.id) !== "" ? `id:${reporter.id}` : reporter?.email ? `email:${reporter.email.toLowerCase()}` : "anon";
  return `magon-support:v1:${clientKey}:${who}`;
}

export function parseState(raw: string | null): WatchState {
  if (!raw) return { ...EMPTY, statuses: {}, mine: [] };
  try {
    const data = JSON.parse(raw) as Partial<WatchState>;
    return {
      statuses: data.statuses && typeof data.statuses === "object" ? { ...data.statuses } : {},
      mine: Array.isArray(data.mine) ? data.mine.filter((n): n is number => Number.isInteger(n)).slice(-50) : [],
    };
  } catch {
    return { statuses: {}, mine: [] };
  }
}

/**
 * Compara contra lo último que vio el usuario.
 * - Un reporte que no estaba registrado se toma como línea de base (no avisa): así, la primera
 *   vez que se abre la app no aparecen avisos de todo el historial.
 * - Sin identidad del usuario (`onlyMine`), solo se siguen los reportes cargados desde este navegador.
 */
export function detectChanges(
  state: WatchState,
  tickets: WatchedTicket[],
  onlyMine: boolean
): { changes: StatusChange[]; next: WatchState } {
  const relevant = onlyMine ? tickets.filter((t) => state.mine.includes(t.number)) : tickets;
  const statuses = { ...state.statuses };
  const changes: StatusChange[] = [];
  for (const ticket of relevant) {
    const key = String(ticket.number);
    const before = statuses[key];
    if (before !== undefined && before !== ticket.status) {
      changes.push({ number: ticket.number, title: ticket.title, from: before, to: ticket.status });
    }
    statuses[key] = ticket.status;
  }
  return { changes, next: { statuses, mine: state.mine } };
}

/** Al cargar un reporte nuevo: queda como propio y con su estado inicial ya visto. */
export function rememberSubmitted(state: WatchState, number: number, status = "new"): WatchState {
  return {
    statuses: { ...state.statuses, [String(number)]: status },
    mine: [...state.mine.filter((n) => n !== number), number].slice(-50),
  };
}
