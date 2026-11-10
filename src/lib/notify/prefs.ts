// Preferencias de avisos y armado de mensajes. Sin dependencias: se prueba suelto.

export const CHANNELS = ["whatsapp", "discord", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const EVENTS = ["new_ticket", "assigned", "comment"] as const;
export type NotifyEvent = (typeof EVENTS)[number];

export type ChannelPrefs = {
  whatsapp: { enabled: boolean; number: string | null };
  discord: { enabled: boolean; webhook: string | null };
  email: { enabled: boolean; address: string | null };
};

export type Prefs = { channels: ChannelPrefs; events: NotifyEvent[] };

export const EMPTY_CHANNELS: ChannelPrefs = {
  whatsapp: { enabled: false, number: null },
  discord: { enabled: false, webhook: null },
  email: { enabled: false, address: null },
};

// Solo dígitos, con código de país (Argentina: 549 + área + número).
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// Solo webhooks de Discord: la URL la carga el usuario y el servidor hace el POST.
export function normalizeDiscordWebhook(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const hostOk = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"].includes(url.hostname);
    return url.protocol === "https:" && hostOk && url.pathname.startsWith("/api/webhooks/") ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// Lee lo guardado en la base (o lo que manda el panel) y descarta lo inválido.
export function parseChannels(raw: unknown): ChannelPrefs {
  const data = record(raw);
  const whatsapp = record(data.whatsapp);
  const discord = record(data.discord);
  const email = record(data.email);
  const number = normalizePhone(whatsapp.number);
  const webhook = normalizeDiscordWebhook(discord.webhook);
  const address = normalizeEmail(email.address);
  return {
    whatsapp: { enabled: bool(whatsapp.enabled) && number !== null, number },
    discord: { enabled: bool(discord.enabled) && webhook !== null, webhook },
    email: { enabled: bool(email.enabled) && address !== null, address },
  };
}

// Para avisar al usuario qué dato está mal en vez de guardarlo apagado sin explicación.
export function channelProblems(raw: unknown): string[] {
  const data = record(raw);
  const problems: string[] = [];
  const whatsapp = record(data.whatsapp);
  const discord = record(data.discord);
  const email = record(data.email);
  if (bool(whatsapp.enabled) && !normalizePhone(whatsapp.number)) {
    problems.push("El número de WhatsApp tiene que tener código de país y área (ej.: 5491122334455)");
  }
  if (bool(discord.enabled) && !normalizeDiscordWebhook(discord.webhook)) {
    problems.push("El webhook de Discord tiene que empezar con https://discord.com/api/webhooks/");
  }
  if (bool(email.enabled) && !normalizeEmail(email.address)) problems.push("El correo no es válido");
  return problems;
}

export function parseEvents(raw: unknown): NotifyEvent[] {
  if (!Array.isArray(raw)) return [...EVENTS];
  return EVENTS.filter((event) => raw.includes(event));
}

export type TicketForMessage = {
  id: string;
  number: number;
  title: string;
  type: "bug" | "feature";
  urgency: string;
  client_name: string;
};

const URGENCY_LABEL: Record<string, string> = { low: "baja", medium: "media", high: "alta", critical: "crítica" };

export type MessageContext = { actorName?: string | null; comment?: string | null; panelUrl: string };

export function ticketLink(panelUrl: string, ticketId: string): string {
  return `${panelUrl.replace(/\/$/, "")}/admin?ticket=${encodeURIComponent(ticketId)}`;
}

export function buildMessage(event: NotifyEvent | "test", ticket: TicketForMessage | null, ctx: MessageContext) {
  if (event === "test" || !ticket) {
    return {
      subject: "Prueba de avisos de Magon",
      text: "✅ Prueba de avisos del panel de Magon: este canal está bien configurado.",
    };
  }
  const kind = ticket.type === "bug" ? "Problema" : "Funcionalidad";
  const head = `#${ticket.number} · ${ticket.client_name}`;
  const link = ticketLink(ctx.panelUrl, ticket.id);
  if (event === "new_ticket") {
    return {
      subject: `Nuevo ticket ${head}: ${ticket.title}`,
      text: `🆕 Nuevo ticket ${head}\n${ticket.title}\n${kind} · urgencia ${URGENCY_LABEL[ticket.urgency] ?? ticket.urgency}\n${link}`,
    };
  }
  if (event === "assigned") {
    return {
      subject: `Te asignaron el ticket ${head}`,
      text: `👤 ${ctx.actorName ?? "Alguien"} te asignó el ticket ${head}\n${ticket.title}\n${link}`,
    };
  }
  const comment = (ctx.comment ?? "").slice(0, 500);
  return {
    subject: `Comentario en el ticket ${head}`,
    text: `💬 ${ctx.actorName ?? "Alguien"} comentó en el ticket ${head}\n${ticket.title}\n«${comment}»\n${link}`,
  };
}

// Estados como los ve el cliente (mismos textos que "Mis reportes" del botón de reportes).
export const CLIENT_STATUS_LABEL: Record<string, string> = {
  new: "Recibido",
  analysis: "En análisis",
  ready: "Planificado",
  in_progress: "En desarrollo",
  testing: "En prueba",
  done: "Resuelto",
  discarded: "Cerrado",
};

const STATUS_DETAIL: Record<string, string> = {
  analysis: "Ya lo estamos revisando.",
  ready: "Ya está planificado para resolverlo.",
  in_progress: "Lo estamos resolviendo.",
  testing: "Lo estamos probando antes de publicarlo.",
  done: "Ya está resuelto. Si ves que sigue pasando, cargá un reporte nuevo desde el mismo botón.",
  discarded: "Lo cerramos sin cambios. Si tenés dudas, respondé este correo.",
  new: "Lo recibimos de nuevo y lo vamos a revisar.",
};

export function buildReporterStatusEmail(
  ticket: Pick<TicketForMessage, "number" | "title" | "client_name">,
  reporterName: string | null,
  to: string
) {
  const label = CLIENT_STATUS_LABEL[to] ?? to;
  const hello = reporterName?.trim() ? `Hola ${reporterName.trim().split(/\s+/)[0]},` : "Hola,";
  return {
    subject: `Tu reporte #${ticket.number} está ${label.toLowerCase()}`,
    text: [
      hello,
      "",
      `Tu reporte #${ticket.number} «${ticket.title}» cambió de estado: ahora está ${label.toUpperCase()}.`,
      STATUS_DETAIL[to] ?? "",
      "",
      "Podés seguirlo desde el botón «Reportar» de tu sistema, en la pestaña «Mis reportes».",
      "",
      "Equipo de Magon",
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n"),
  };
}
