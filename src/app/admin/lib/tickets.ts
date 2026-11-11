export type TicketStatus = "new" | "analysis" | "ready" | "in_progress" | "testing" | "done" | "discarded";
export type TicketUrgency = "low" | "medium" | "high" | "critical";
export type TicketType = "bug" | "feature";

export type Ticket = {
  id: string;
  number: number;
  client_id: string;
  client_name: string;
  channel: string;
  type: TicketType;
  title: string;
  description: string;
  expected: string | null;
  actual: string | null;
  urgency: TicketUrgency;
  status: TicketStatus;
  position: number;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_ref: string | null;
  page_url: string | null;
  user_agent: string | null;
  app_version: string | null;
  internal_notes: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  labels: string[];
  attachment_urls: Array<{ path: string; name: string; url: string | null }>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  status_since: string;
  // Mensaje para el cliente al cerrar (migración 011).
  client_note?: string | null;
  // Análisis del agente y respuestas del equipo (migración 009; pueden faltar antes).
  triage?: TriageResult | null;
  decisions?: Decision[];
  // Issue en el repo del cliente donde trabaja Claude Code (migración 010).
  github_issue?: GithubIssueLink | null;
};

export type GithubIssueLink = { repo: string; number: number; url: string; createdAt: string; createdBy: string };

export type TriageQuestion = { id: string; kind: "negocio" | "tecnica" | "cliente"; question: string; why: string };
export type TriageResult = {
  verdict: "direct" | "needs_decision";
  summary: string;
  questions: TriageQuestion[];
  analyzedAt: string;
  analyzedBy: string;
  model: string;
};
export type Decision = { questionId: string | null; question: string; answer: string; by: string; at: string };

export type Activity = {
  id: string;
  kind: "comment" | "status" | "assignee" | "urgency" | "labels" | "created" | "triage" | "decision" | "github";
  authorName: string | null;
  body: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type Me = { id: string | null; name: string; email: string | null; emergency: boolean };
export type PanelUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  pending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export const COLUMNS: Array<{ status: TicketStatus; label: string; color: string }> = [
  { status: "new", label: "Nuevo", color: "blue" },
  { status: "analysis", label: "En análisis", color: "cyan" },
  { status: "ready", label: "Listo para hacer", color: "grape" },
  { status: "in_progress", label: "En desarrollo", color: "brand" },
  { status: "testing", label: "Para probar", color: "orange" },
  { status: "done", label: "Resuelto", color: "teal" },
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Nuevo",
  analysis: "En análisis",
  ready: "Listo para hacer",
  in_progress: "En desarrollo",
  testing: "Para probar",
  done: "Resuelto",
  discarded: "Descartado",
};

export const STATUS_COLOR: Record<TicketStatus, string> = {
  new: "blue",
  analysis: "cyan",
  ready: "grape",
  in_progress: "brand",
  testing: "orange",
  done: "teal",
  discarded: "gray",
};

export const URGENCY: Record<TicketUrgency, { label: string; color: string; rank: number }> = {
  critical: { label: "Crítica", color: "red", rank: 0 },
  high: { label: "Alta", color: "orange", rank: 1 },
  medium: { label: "Media", color: "yellow", rank: 2 },
  low: { label: "Baja", color: "gray", rank: 3 },
};

export const TYPE: Record<TicketType, { label: string; color: string }> = {
  bug: { label: "Problema", color: "red" },
  feature: { label: "Funcionalidad", color: "brand" },
};

// Sugerencias para catalogar; se suman las etiquetas que ya se usaron.
export const LABEL_SUGGESTIONS = [
  "pagos",
  "facturación",
  "reportes",
  "login",
  "permisos",
  "ui",
  "mobile",
  "rendimiento",
  "datos",
  "integración",
  "whatsapp",
  "pdf",
];

// Por dónde llegó un ticket cargado a mano desde el panel.
export const MANUAL_SOURCES: Array<{ value: string; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Correo" },
  { value: "llamada", label: "Llamada" },
  { value: "reunion", label: "Reunión" },
  { value: "manual", label: "Otro" },
];

export function sourceLabel(channel: string): string {
  return MANUAL_SOURCES.find((source) => source.value === channel)?.label ?? channel;
}

export function isClosed(status: TicketStatus): boolean {
  return status === "done" || status === "discarded";
}
