import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notify, subscription } from "@/lib/env";
import { addMonths, formatPeriodLabel, periodOf } from "@/lib/subscription/period";

/**
 * Reporte mensual para el cliente: qué se resolvió, qué entró, en qué se está trabajando, horas
 * dedicadas, caídas y avance de proyectos. Se arma al vuelo y se copia o se manda por correo.
 * Sin notas internas ni nombres del equipo.
 */

export class ReportError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

type TicketLite = { number: number; title: string; type: string; status: string; channel: string; created_at: string; resolved_at: string | null };

export type ClientReport = {
  client: { id: string; name: string; email: string | null };
  period: string;
  periodLabel: string;
  resolved: TicketLite[];
  opened: TicketLite[];
  inProgress: TicketLite[];
  incidents: TicketLite[];
  minutes: number;
  projects: Array<{ name: string; status: string; done: number; total: number; due_date: string | null }>;
  text: string;
};

const IN_PROGRESS = ["analysis", "waiting", "ready", "in_progress", "testing"];
const PROJECT_STATUS: Record<string, string> = {
  planning: "planificando",
  in_progress: "en curso",
  paused: "en pausa",
  delivered: "entregado",
  cancelled: "cancelado",
};

/** Límites del mes en UTC, tomando el mes calendario de Argentina (aprox. -03:00). */
function monthBounds(period: string): { from: string; to: string } {
  const from = new Date(`${period}-01T03:00:00Z`).toISOString();
  const to = new Date(`${addMonths(period, 1)}-01T03:00:00Z`).toISOString();
  return { from, to };
}

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${String(h).replace(".", ",")} h`;
}

export function buildReportText(report: Omit<ClientReport, "text">): string {
  const lines: string[] = [];
  lines.push(`Hola ${report.client.name}:`, "");
  lines.push(`Te compartimos el resumen de ${report.periodLabel} de tu sistema.`, "");

  if (report.resolved.length) {
    lines.push(`✅ Resolvimos ${report.resolved.length} pedido(s):`);
    for (const t of report.resolved) lines.push(`  • #${t.number} ${t.title}`);
    lines.push("");
  } else {
    lines.push("✅ Este mes no hubo pedidos para resolver.", "");
  }
  if (report.inProgress.length) {
    lines.push(`🛠️ En curso (${report.inProgress.length}):`);
    for (const t of report.inProgress) lines.push(`  • #${t.number} ${t.title}`);
    lines.push("");
  }
  if (report.opened.length) lines.push(`📥 Entraron ${report.opened.length} reporte(s) nuevos en el mes.`, "");
  if (report.projects.length) {
    lines.push("📌 Proyectos:");
    for (const p of report.projects) {
      const progress = p.total ? ` · ${p.done}/${p.total} etapas` : "";
      lines.push(`  • ${p.name} (${PROJECT_STATUS[p.status] ?? p.status}${progress})`);
    }
    lines.push("");
  }
  if (report.minutes > 0) lines.push(`⏱️ Horas dedicadas: ${hours(report.minutes)}.`, "");
  if (report.incidents.length) {
    lines.push(`⚠️ El sistema tuvo ${report.incidents.length} interrupción(es) detectadas por nuestro monitoreo; ya están resueltas o en curso.`, "");
  } else {
    lines.push("🟢 Sin caídas detectadas por nuestro monitoreo.", "");
  }
  lines.push("Cualquier cosa que necesites, cargalo desde el botón «Reportar» del sistema.", "", "Equipo de Magon");
  return lines.join("\n");
}

export async function buildClientReport(clientId: string, periodRaw: unknown): Promise<ClientReport> {
  const period =
    typeof periodRaw === "string" && /^\d{4}-\d{2}$/.test(periodRaw)
      ? periodRaw
      : addMonths(periodOf(new Date(), subscription.timezone), -1);
  const supabase = getSupabaseAdmin();
  const { data: client, error } = await supabase.from("clients").select("id,name,email").eq("id", clientId).maybeSingle();
  if (error) throw error;
  if (!client) throw new ReportError("NOT_FOUND", 404, "Cliente no encontrado");

  const { from, to } = monthBounds(period);
  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("number,title,type,status,channel,created_at,resolved_at")
    .eq("client_id", clientId)
    .or(`and(created_at.gte.${from},created_at.lt.${to}),and(resolved_at.gte.${from},resolved_at.lt.${to}),status.in.(${IN_PROGRESS.join(",")})`)
    .order("number");
  if (ticketsError) throw ticketsError;
  const rows = (tickets ?? []) as TicketLite[];
  const inMonth = (iso: string | null) => Boolean(iso && iso >= from && iso < to);

  // Horas y proyectos son opcionales: sin sus migraciones, el reporte sale igual.
  let minutes = 0;
  const { data: time } = await supabase
    .from("time_entries")
    .select("minutes")
    .eq("client_id", clientId)
    .gte("work_date", `${period}-01`)
    .lt("work_date", `${addMonths(period, 1)}-01`)
    .not("minutes", "is", null);
  for (const row of time ?? []) minutes += Number(row.minutes);

  const { data: projectRows } = await supabase
    .from("projects")
    .select("name,status,due_date,project_milestones(done_at)")
    .eq("client_id", clientId)
    .in("status", ["planning", "in_progress", "paused"]);
  const projects = ((projectRows ?? []) as Array<{ name: string; status: string; due_date: string | null; project_milestones: Array<{ done_at: string | null }> | null }>)
    .map((p) => ({
      name: p.name,
      status: p.status,
      due_date: p.due_date,
      done: (p.project_milestones ?? []).filter((m) => m.done_at).length,
      total: (p.project_milestones ?? []).length,
    }));

  const base = {
    client: { id: client.id as string, name: client.name as string, email: (client.email as string | null) ?? null },
    period,
    periodLabel: formatPeriodLabel(period),
    resolved: rows.filter((t) => t.status === "done" && inMonth(t.resolved_at) && t.channel !== "monitoreo"),
    opened: rows.filter((t) => inMonth(t.created_at) && t.channel !== "monitoreo"),
    inProgress: rows.filter((t) => IN_PROGRESS.includes(t.status) && t.channel !== "monitoreo"),
    incidents: rows.filter((t) => t.channel === "monitoreo" && inMonth(t.created_at)),
    minutes,
    projects,
  };
  return { ...base, text: buildReportText(base) };
}

/** Manda el reporte al email del cliente (o al que se indique) por Resend. */
export async function sendClientReport(report: ClientReport, toRaw: unknown): Promise<string> {
  const to = typeof toRaw === "string" && toRaw.includes("@") ? toRaw.trim() : report.client.email;
  if (!to) throw new ReportError("NO_EMAIL", 400, "El cliente no tiene email: cargalo o escribí uno");
  if (!notify.resendApiKey) throw new ReportError("NO_EMAIL_CHANNEL", 503, "Falta configurar RESEND_API_KEY para mandar correos");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${notify.resendApiKey}` },
    body: JSON.stringify({
      from: notify.emailFrom,
      to: [to],
      subject: `Resumen de ${report.periodLabel} · Magon`,
      text: report.text,
    }),
  });
  if (!response.ok) throw new ReportError("SEND_FAILED", 502, `No se pudo mandar el correo (HTTP ${response.status})`);
  return to;
}
