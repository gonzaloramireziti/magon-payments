// Reglas de la ticketera sin dependencias de framework ni de base de datos.

export const TICKET_TYPES = ["bug", "feature"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_URGENCIES = ["low", "medium", "high", "critical"] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

// Orden de las columnas del tablero. "discarded" no es una columna: queda fuera del tablero.
export const TICKET_STATUSES = [
  "new",
  "analysis",
  "ready",
  "in_progress",
  "testing",
  "done",
  "discarded",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type SupportPolicy = Record<string, TicketType[]>;

export const DEFAULT_CHANNEL = "default";
export const DEFAULT_POLICY: SupportPolicy = { [DEFAULT_CHANNEL]: ["bug", "feature"] };

export const LIMITS = {
  title: 140,
  text: 5000,
  short: 300,
  attachments: 3,
  attachmentBytes: 4 * 1024 * 1024,
  ticketsPerHour: 20,
};

export const ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function isTicketType(value: unknown): value is TicketType {
  return typeof value === "string" && (TICKET_TYPES as readonly string[]).includes(value);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketUrgency(value: unknown): value is TicketUrgency {
  return typeof value === "string" && (TICKET_URGENCIES as readonly string[]).includes(value);
}

export function normalizeChannel(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CHANNEL;
  const channel = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(channel) ? channel : DEFAULT_CHANNEL;
}

// Normaliza lo que venga de la columna jsonb: descarta tipos desconocidos y canales vacíos.
export function parsePolicy(raw: unknown): SupportPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_POLICY };
  const policy: SupportPolicy = {};
  for (const [channel, types] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(types)) continue;
    const valid = Array.from(new Set(types.filter(isTicketType)));
    policy[normalizeChannel(channel)] = valid;
  }
  if (!policy[DEFAULT_CHANNEL]) policy[DEFAULT_CHANNEL] = [...DEFAULT_POLICY[DEFAULT_CHANNEL]];
  return policy;
}

export function allowedTypes(policy: SupportPolicy, channel: string): TicketType[] {
  return policy[channel] ?? policy[DEFAULT_CHANNEL] ?? [];
}

export type TicketInput = {
  channel: string;
  type: TicketType;
  title: string;
  description: string;
  expected: string | null;
  actual: string | null;
  urgency: TicketUrgency;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterRef: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  appVersion: string | null;
};

export type ValidationResult =
  | { ok: true; value: TicketInput }
  | { ok: false; code: string; message: string };

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
}

export function validateTicketInput(
  raw: Record<string, unknown>,
  policy: SupportPolicy
): ValidationResult {
  const channel = normalizeChannel(raw.channel);
  const allowed = allowedTypes(policy, channel);

  if (!isTicketType(raw.type)) {
    return { ok: false, code: "INVALID_TYPE", message: "El tipo de reporte no es válido" };
  }
  if (!allowed.includes(raw.type)) {
    return {
      ok: false,
      code: "TYPE_NOT_ALLOWED",
      message:
        raw.type === "feature"
          ? "Desde acá solo se pueden reportar problemas"
          : "Este tipo de reporte no está habilitado",
    };
  }

  const title = text(raw.title, LIMITS.title);
  const description = text(raw.description, LIMITS.text);
  if (!title) return { ok: false, code: "MISSING_TITLE", message: "Falta el título" };
  if (!description) {
    return { ok: false, code: "MISSING_DESCRIPTION", message: "Falta la descripción" };
  }

  const urgency = isTicketUrgency(raw.urgency) ? raw.urgency : "medium";
  const email = text(raw.reporterEmail, LIMITS.short);

  return {
    ok: true,
    value: {
      channel,
      type: raw.type,
      title,
      description,
      // "Qué esperabas" y "qué pasó" solo tienen sentido en un problema.
      expected: raw.type === "bug" ? text(raw.expected, LIMITS.text) : null,
      actual: raw.type === "bug" ? text(raw.actual, LIMITS.text) : null,
      urgency,
      reporterName: text(raw.reporterName, LIMITS.short),
      reporterEmail: email && email.includes("@") ? email : null,
      reporterRef: text(raw.reporterRef, LIMITS.short),
      pageUrl: text(raw.pageUrl, 1000),
      userAgent: text(raw.userAgent, LIMITS.short),
      appVersion: text(raw.appVersion, 60),
    },
  };
}

// --- Carga manual desde el panel -------------------------------------------------------------
// Pedidos que el cliente manda por fuera del widget (WhatsApp, mail, llamada, reunión). La carga
// un usuario del panel: no aplica la política de tipos del cliente ni el límite por hora, y la
// descripción admite textos más largos porque suelen ser conversaciones pegadas enteras.

export const MANUAL_SOURCES = ["whatsapp", "email", "llamada", "reunion", "manual"] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];

export const MANUAL_TEXT_LIMIT = 20000;

// Estados posibles al cargar: cualquier columna abierta (a veces ya está analizado o listo).
export const MANUAL_INITIAL_STATUSES = ["new", "analysis", "ready", "in_progress"] as const;

export type ManualTicketInput = Omit<TicketInput, "pageUrl" | "userAgent" | "appVersion"> & {
  clientId: string;
  status: TicketStatus;
  assigneeId: string | null;
  labels: string[];
};

export type ManualValidationResult =
  | { ok: true; value: ManualTicketInput }
  | { ok: false; code: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Las etiquetas pueden venir como arreglo (JSON) o como texto JSON (multipart).
function labelsFrom(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      return normalizeLabels(JSON.parse(raw));
    } catch {
      return normalizeLabels(raw.split(","));
    }
  }
  return normalizeLabels(raw);
}

export function validateManualTicketInput(raw: Record<string, unknown>): ManualValidationResult {
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  if (!UUID.test(clientId)) return { ok: false, code: "MISSING_CLIENT", message: "Elegí el cliente" };

  if (!isTicketType(raw.type)) {
    return { ok: false, code: "INVALID_TYPE", message: "El tipo de ticket no es válido" };
  }

  const title = text(raw.title, LIMITS.title);
  const description = text(raw.description, MANUAL_TEXT_LIMIT);
  if (!title) return { ok: false, code: "MISSING_TITLE", message: "Falta el título" };
  if (!description) return { ok: false, code: "MISSING_DESCRIPTION", message: "Falta la descripción" };

  const source = typeof raw.channel === "string" ? raw.channel.trim().toLowerCase() : "";
  const channel = (MANUAL_SOURCES as readonly string[]).includes(source) ? source : "manual";

  const status = (MANUAL_INITIAL_STATUSES as readonly string[]).includes(raw.status as string)
    ? (raw.status as TicketStatus)
    : "new";

  const assigneeRaw = typeof raw.assigneeId === "string" ? raw.assigneeId.trim() : "";
  if (assigneeRaw && !UUID.test(assigneeRaw)) {
    return { ok: false, code: "INVALID_ASSIGNEE", message: "Ese usuario no existe" };
  }

  const email = text(raw.reporterEmail, LIMITS.short);

  return {
    ok: true,
    value: {
      clientId,
      channel,
      type: raw.type,
      title,
      description,
      expected: raw.type === "bug" ? text(raw.expected, LIMITS.text) : null,
      actual: raw.type === "bug" ? text(raw.actual, LIMITS.text) : null,
      urgency: isTicketUrgency(raw.urgency) ? raw.urgency : "medium",
      status,
      assigneeId: assigneeRaw || null,
      labels: labelsFrom(raw.labels),
      reporterName: text(raw.reporterName, LIMITS.short),
      reporterEmail: email && email.includes("@") ? email : null,
      reporterRef: text(raw.reporterRef, LIMITS.short),
    },
  };
}

export type AttachmentCandidate = { name: string; type: string; size: number };

export function validateAttachments(files: AttachmentCandidate[]): string | null {
  if (files.length > LIMITS.attachments) {
    return `Se pueden adjuntar hasta ${LIMITS.attachments} capturas`;
  }
  const total = files.reduce((acc, file) => acc + file.size, 0);
  if (total > LIMITS.attachmentBytes) return "Las capturas superan los 4 MB en total";
  if (files.some((file) => !ATTACHMENT_MIME_TYPES.includes(file.type))) {
    return "Solo se aceptan imágenes PNG, JPG, WEBP o GIF";
  }
  return null;
}

// Al cerrar un ticket se registra la fecha; al reabrirlo se limpia.
export function resolvedAtFor(status: TicketStatus, current: string | null, now: string): string | null {
  if (status === "done" || status === "discarded") return current ?? now;
  return null;
}

// Etiquetas para catalogar: minúsculas, sin espacios de más, sin repetir, hasta 10 de 30 caracteres.
export const MAX_LABELS = 10;

export function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30))
    .filter(Boolean);
  return Array.from(new Set(labels)).slice(0, MAX_LABELS);
}

export const MAX_COMMENT = 5000;

export function normalizeComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  return body === "" ? null : body.slice(0, MAX_COMMENT);
}
