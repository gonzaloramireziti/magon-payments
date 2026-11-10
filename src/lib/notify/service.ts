import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/env";
import {
  buildMessage,
  buildReporterStatusEmail,
  channelProblems,
  parseChannels,
  parseEvents,
  type Channel,
  type ChannelPrefs,
  type NotifyEvent,
  type Prefs,
  type TicketForMessage,
} from "@/lib/notify/prefs";

export class NotifyError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Qué canales puede usar el servidor. Discord no necesita nada: el webhook lo pone cada usuario.
export function availableChannels(): Record<Channel, boolean> {
  return {
    discord: true,
    email: Boolean(notify.resendApiKey && notify.emailFrom),
    whatsapp: Boolean(notify.evolutionUrl && notify.evolutionKey && notify.evolutionInstance),
  };
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), notify.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`HTTP ${response.status} ${detail}`.trim());
    }
  } finally {
    clearTimeout(timer);
  }
}

async function send(channel: Channel, prefs: ChannelPrefs, message: { subject: string; text: string }) {
  if (channel === "discord") {
    await post(prefs.discord.webhook!, { content: message.text.slice(0, 1900), username: "Magon" });
    return;
  }
  if (channel === "email") {
    await post(
      "https://api.resend.com/emails",
      { from: notify.emailFrom, to: [prefs.email.address], subject: message.subject, text: message.text },
      { authorization: `Bearer ${notify.resendApiKey}` }
    );
    return;
  }
  await post(
    `${notify.evolutionUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(notify.evolutionInstance)}`,
    { number: prefs.whatsapp.number, text: message.text },
    { apikey: notify.evolutionKey }
  );
}

function activeChannels(prefs: ChannelPrefs): Channel[] {
  const available = availableChannels();
  return (Object.keys(prefs) as Channel[]).filter((channel) => prefs[channel].enabled && available[channel]);
}

async function log(entry: { userId: string; channel: string; event: string; ticketId: string | null; ok: boolean; error?: string }) {
  await getSupabaseAdmin()
    .from("notification_log")
    .insert({
      user_id: entry.userId,
      channel: entry.channel,
      event: entry.event,
      ticket_id: entry.ticketId,
      ok: entry.ok,
      error: entry.error ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[notify] no se pudo registrar el envío", error.message);
    });
}

type Recipient = { id: string; channels: ChannelPrefs; events: NotifyEvent[] };

async function recipients(filter: { onlyUserId?: string; exceptUserId?: string | null }): Promise<Recipient[]> {
  let query = getSupabaseAdmin().from("admin_users").select("id,notify_channels,notify_events").eq("active", true);
  if (filter.onlyUserId) query = query.eq("id", filter.onlyUserId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.id !== filter.exceptUserId)
    .map((row) => ({
      id: row.id as string,
      channels: parseChannels(row.notify_channels),
      events: parseEvents(row.notify_events),
    }));
}

// Nunca hace fallar la operación que lo dispara: los errores quedan en notification_log.
export async function notifyEvent(
  event: NotifyEvent,
  ticket: TicketForMessage,
  options: { onlyUserId?: string; exceptUserId?: string | null; actorName?: string | null; comment?: string | null } = {}
): Promise<void> {
  try {
    const targets = (await recipients(options)).filter((r) => r.events.includes(event));
    const message = buildMessage(event, ticket, {
      actorName: options.actorName,
      comment: options.comment,
      panelUrl: notify.panelUrl,
    });
    await Promise.allSettled(
      targets.flatMap((target) =>
        activeChannels(target.channels).map(async (channel) => {
          try {
            await send(channel, target.channels, message);
            await log({ userId: target.id, channel, event, ticketId: ticket.id, ok: true });
          } catch (error) {
            await log({ userId: target.id, channel, event, ticketId: ticket.id, ok: false, error: (error as Error).message });
          }
        })
      )
    );
  } catch (error) {
    console.error("[notify]", error);
  }
}

export async function getPrefs(userId: string): Promise<Prefs> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("notify_channels,notify_events")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return { channels: parseChannels(data?.notify_channels), events: parseEvents(data?.notify_events) };
}

export async function savePrefs(userId: string, raw: { channels?: unknown; events?: unknown }): Promise<Prefs> {
  const problems = channelProblems(raw.channels);
  if (problems.length) throw new NotifyError("INVALID_PREFS", 400, problems.join(". "));
  const prefs = { channels: parseChannels(raw.channels), events: parseEvents(raw.events) };
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ notify_channels: prefs.channels, notify_events: prefs.events })
    .eq("id", userId);
  if (error) throw error;
  return prefs;
}

// "Probar": manda un mensaje por un canal con los datos que el usuario tiene cargados en pantalla.
export async function sendTest(userId: string, channel: Channel, rawChannels: unknown): Promise<void> {
  if (!availableChannels()[channel]) {
    throw new NotifyError("CHANNEL_UNAVAILABLE", 400, "Este canal todavía no está configurado en el servidor");
  }
  const forced = { ...(rawChannels as Record<string, unknown>) };
  forced[channel] = { ...((forced[channel] as Record<string, unknown>) ?? {}), enabled: true };
  const problems = channelProblems(forced);
  if (problems.length) throw new NotifyError("INVALID_PREFS", 400, problems.join(". "));
  const prefs = parseChannels(forced);
  try {
    await send(channel, prefs, buildMessage("test", null, { panelUrl: notify.panelUrl }));
    await log({ userId, channel, event: "test", ticketId: null, ok: true });
  } catch (error) {
    await log({ userId, channel, event: "test", ticketId: null, ok: false, error: (error as Error).message });
    throw new NotifyError("SEND_FAILED", 502, `No se pudo enviar: ${(error as Error).message}`);
  }
}

// Avisa por correo a quien cargó el reporte que cambió de estado. Solo si el reporte tiene email y
// el correo está configurado; nunca hace fallar el cambio de estado.
export async function notifyReporterStatus(
  ticket: TicketForMessage,
  reporter: { name: string | null; email: string | null },
  from: string,
  to: string
): Promise<void> {
  if (!reporter.email || from === to || !availableChannels().email) return;
  const message = buildReporterStatusEmail(ticket, reporter.name, to);
  try {
    await post(
      "https://api.resend.com/emails",
      { from: notify.emailFrom, to: [reporter.email], subject: message.subject, text: message.text },
      { authorization: `Bearer ${notify.resendApiKey}` }
    );
    await getSupabaseAdmin()
      .from("notification_log")
      .insert({ user_id: null, channel: "email", event: "reporter_status", ticket_id: ticket.id, ok: true });
  } catch (error) {
    await getSupabaseAdmin().from("notification_log").insert({
      user_id: null,
      channel: "email",
      event: "reporter_status",
      ticket_id: ticket.id,
      ok: false,
      error: (error as Error).message,
    });
  }
}
