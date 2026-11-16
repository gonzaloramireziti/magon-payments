import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/auth";
import { notify } from "@/lib/env";
import { notifyAdmins } from "@/lib/notify/service";
import { createManualTicket, recordActivity } from "@/lib/tickets/service";
import { today } from "@/lib/time/service";

/**
 * Infraestructura de los clientes (migración 014):
 * - Vencimientos: dominios, hosting, SSL... con aviso a los admins 30, 7 y 1 día antes y el día.
 * - Monitoreo: cada URL se revisa desde el cron; con 2 fallas seguidas se marca caída, se abre un
 *   ticket crítico y se avisa; cuando vuelve, se avisa y se comenta el ticket.
 */

export class InfraError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const ASSET_KINDS = ["domain", "hosting", "ssl", "database", "email", "license", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type Asset = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  kind: AssetKind;
  name: string;
  provider: string | null;
  expires_on: string | null;
  auto_renew: boolean;
  cost: number | null;
  currency: "ARS" | "USD";
  notes: string | null;
  days_left: number | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Avisos antes del vencimiento (días). El 0 es el mismo día.
export const ALERT_DAYS = [30, 7, 1, 0] as const;

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Qué aviso corresponde hoy: el umbral más chico que ya se alcanzó y todavía no se mandó. */
export function alertThreshold(daysLeft: number, lastAlert: number | null): number | null {
  if (daysLeft < 0) return null;
  const reached = ALERT_DAYS.filter((d) => daysLeft <= d);
  if (!reached.length) return null;
  const threshold = Math.min(...reached);
  if (lastAlert !== null && lastAlert <= threshold) return null;
  return threshold;
}

function parseAsset(raw: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!partial || raw.name !== undefined) {
    const name = text(raw.name, 200);
    if (!name) throw new InfraError("MISSING_NAME", 400, "Falta el nombre (ej: magon.com.ar)");
    out.name = name;
  }
  if (raw.kind !== undefined) {
    if (!(ASSET_KINDS as readonly string[]).includes(raw.kind as string)) throw new InfraError("INVALID_KIND", 400, "Tipo inválido");
    out.kind = raw.kind;
  }
  if (raw.clientId !== undefined) out.client_id = typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null;
  if (raw.provider !== undefined) out.provider = text(raw.provider);
  if (raw.notes !== undefined) out.notes = text(raw.notes, 2000);
  if (raw.autoRenew !== undefined) out.auto_renew = raw.autoRenew === true;
  if (raw.expiresOn !== undefined) {
    if (raw.expiresOn === null || raw.expiresOn === "") out.expires_on = null;
    else if (typeof raw.expiresOn === "string" && DATE.test(raw.expiresOn)) out.expires_on = raw.expiresOn;
    else throw new InfraError("INVALID_DATE", 400, "La fecha de vencimiento no es válida");
    // Nueva fecha (renovado): los avisos vuelven a empezar.
    out.last_alert_days = null;
  }
  if (raw.cost !== undefined) {
    if (raw.cost === null || raw.cost === "") out.cost = null;
    else {
      const cost = Number(raw.cost);
      if (!Number.isFinite(cost) || cost < 0) throw new InfraError("INVALID_COST", 400, "El costo no es válido");
      out.cost = cost;
    }
  }
  if (raw.currency !== undefined) {
    if (raw.currency !== "ARS" && raw.currency !== "USD") throw new InfraError("INVALID_CURRENCY", 400, "Moneda inválida");
    out.currency = raw.currency;
  }
  return out;
}

type AssetRow = Omit<Asset, "client_name" | "days_left" | "cost"> & {
  cost: number | string | null;
  last_alert_days: number | null;
  clients: { name: string } | null;
};

function toAsset(row: AssetRow, now = today()): Asset {
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.clients?.name ?? null,
    kind: row.kind,
    name: row.name,
    provider: row.provider,
    expires_on: row.expires_on,
    auto_renew: row.auto_renew,
    cost: row.cost === null ? null : Number(row.cost),
    currency: row.currency,
    notes: row.notes,
    days_left: row.expires_on ? daysBetween(now, row.expires_on) : null,
  };
}

const ASSET_SELECT = "*,clients(name)";

export async function listAssets(): Promise<Asset[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_assets")
    .select(ASSET_SELECT)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as AssetRow[]).map((row) => toAsset(row));
}

/** Lo que vence en los próximos `days` días (o ya venció y no tiene renovación automática). */
export async function upcomingAssets(days = 30): Promise<Asset[]> {
  const limit = new Date(Date.parse(`${today()}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin()
    .from("client_assets")
    .select(ASSET_SELECT)
    .not("expires_on", "is", null)
    .lte("expires_on", limit)
    .order("expires_on", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as AssetRow[]).map((row) => toAsset(row));
}

export async function saveAsset(raw: Record<string, unknown>): Promise<Asset> {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const values = parseAsset(raw, Boolean(id));
  const supabase = getSupabaseAdmin();
  const query = id
    ? supabase.from("client_assets").update(values).eq("id", id)
    : supabase.from("client_assets").insert(values);
  const { data, error } = await query.select(ASSET_SELECT).single();
  if (error) throw error;
  return toAsset(data as unknown as AssetRow);
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("client_assets").delete().eq("id", id);
  if (error) throw error;
}

const KIND_LABEL: Record<AssetKind, string> = {
  domain: "Dominio",
  hosting: "Hosting",
  ssl: "Certificado SSL",
  database: "Base de datos",
  email: "Correo",
  license: "Licencia",
  other: "Servicio",
};

/** Cron diario: avisa a los admins lo que vence (una vez por umbral). */
export async function runExpiryAlerts(): Promise<{ alerted: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("client_assets")
    .select(ASSET_SELECT)
    .not("expires_on", "is", null)
    .lte("expires_on", new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10));
  if (error) throw error;
  const due: Array<{ asset: Asset; threshold: number }> = [];
  for (const row of (data ?? []) as unknown as AssetRow[]) {
    const asset = toAsset(row);
    if (asset.days_left === null) continue;
    const threshold = alertThreshold(asset.days_left, row.last_alert_days);
    if (threshold !== null) due.push({ asset, threshold });
  }
  if (!due.length) return { alerted: 0 };

  const lines = due.map(({ asset }) => {
    const when = asset.days_left === 0 ? "vence HOY" : `vence en ${asset.days_left} día(s) (${asset.expires_on})`;
    const who = asset.client_name ?? "Magon";
    const renew = asset.auto_renew ? " · renovación automática" : "";
    return `• ${KIND_LABEL[asset.kind]} ${asset.name} — ${who}: ${when}${asset.provider ? ` en ${asset.provider}` : ""}${renew}`;
  });
  const panel = notify.panelUrl ? `\n${notify.panelUrl.replace(/\/$/, "")}/admin#infraestructura` : "";
  await notifyAdmins("expiring", {
    subject: due.length === 1 ? `Vence ${due[0].asset.name}` : `Vencen ${due.length} servicios`,
    text: `⏰ Vencimientos próximos\n${lines.join("\n")}${panel}`,
  });
  for (const { asset, threshold } of due) {
    await supabase.from("client_assets").update({ last_alert_days: threshold }).eq("id", asset.id);
  }
  return { alerted: due.length };
}

// ---------------------------------------------------------------------------------------------
// Monitoreo

export type UptimeCheck = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  name: string;
  url: string;
  active: boolean;
  status: "up" | "down" | null;
  fail_count: number;
  last_checked_at: string | null;
  last_change_at: string | null;
  last_ms: number | null;
  last_error: string | null;
  incident_ticket_id: string | null;
};

type CheckRow = Omit<UptimeCheck, "client_name"> & { clients: { name: string } | null };

const CHECK_SELECT = "*,clients(name)";
// Fallas seguidas para considerarlo caído (evita avisos por un error aislado).
export const FAILS_TO_DOWN = 2;
const TIMEOUT_MS = 10_000;

function toCheck(row: CheckRow): UptimeCheck {
  const { clients, ...rest } = row;
  return { ...rest, client_name: clients?.name ?? null };
}

function parseUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new InfraError("INVALID_URL", 400, "La URL no es válida (tiene que empezar con https://)");
  }
}

export async function listChecks(): Promise<UptimeCheck[]> {
  const { data, error } = await getSupabaseAdmin().from("uptime_checks").select(CHECK_SELECT).order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as CheckRow[]).map(toCheck);
}

export async function saveCheck(raw: Record<string, unknown>): Promise<UptimeCheck> {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const values: Record<string, unknown> = {};
  if (!id || raw.name !== undefined) {
    const name = text(raw.name, 200);
    if (!name) throw new InfraError("MISSING_NAME", 400, "Falta el nombre");
    values.name = name;
  }
  if (!id || raw.url !== undefined) values.url = parseUrl(raw.url);
  if (raw.clientId !== undefined) values.client_id = typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null;
  if (raw.active !== undefined) values.active = raw.active === true;
  const supabase = getSupabaseAdmin();
  const query = id ? supabase.from("uptime_checks").update(values).eq("id", id) : supabase.from("uptime_checks").insert(values);
  const { data, error } = await query.select(CHECK_SELECT).single();
  if (error) throw error;
  return toCheck(data as unknown as CheckRow);
}

export async function deleteCheck(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("uptime_checks").delete().eq("id", id);
  if (error) throw error;
}

/** Pide la URL: arriba si responde 2xx-4xx en menos de 10 s (un 401/404 igual es que el server anda). */
export async function probe(url: string): Promise<{ ok: boolean; ms: number; error: string | null }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "MagonMonitor/1.0" },
    });
    const ms = Date.now() - started;
    if (response.status >= 500) return { ok: false, ms, error: `HTTP ${response.status}` };
    return { ok: true, ms, error: null };
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    return { ok: false, ms: Date.now() - started, error: aborted ? "No respondió en 10 s" : (error as Error).message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** Próximo estado según el resultado: cuenta fallas y decide si cambió (con histéresis). */
export function nextState(
  current: { status: "up" | "down" | null; fail_count: number },
  ok: boolean
): { status: "up" | "down" | null; fail_count: number; changed: "down" | "up" | null } {
  if (ok) {
    return { status: "up", fail_count: 0, changed: current.status === "down" ? "up" : null };
  }
  const fails = current.fail_count + 1;
  if (fails >= FAILS_TO_DOWN && current.status !== "down") return { status: "down", fail_count: fails, changed: "down" };
  return { status: current.status, fail_count: fails, changed: null };
}

const MONITOR_ACTOR: AdminSession = { userId: null, name: "Monitoreo", email: null };

async function openIncident(check: UptimeCheck, error: string | null): Promise<string | null> {
  if (!check.client_id) return null;
  try {
    const created = await createManualTicket(
      {
        clientId: check.client_id,
        type: "bug",
        channel: "monitoreo",
        title: `Caído: ${check.name}`.slice(0, 140),
        description: `El monitoreo detectó que ${check.url} no responde.\nError: ${error ?? "sin detalle"}.\nSe abrió solo; al volver se comenta acá.`,
        urgency: "critical",
        status: "new",
        labels: ["caída"],
      },
      [],
      MONITOR_ACTOR
    );
    return created.id;
  } catch (err) {
    console.error("[uptime] no se pudo abrir el ticket", err);
    return null;
  }
}

/** Revisa todos los monitores activos. Lo llama el cron (y el botón «Revisar ahora»). */
export async function runUptimeChecks(): Promise<{ checked: number; down: number; changes: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("uptime_checks").select(CHECK_SELECT).eq("active", true);
  if (error) throw error;
  const checks = ((data ?? []) as unknown as CheckRow[]).map(toCheck);
  let down = 0;
  let changes = 0;
  await Promise.all(
    checks.map(async (check) => {
      const result = await probe(check.url);
      const state = nextState(check, result.ok);
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: state.status,
        fail_count: state.fail_count,
        last_checked_at: now,
        last_ms: result.ms,
        last_error: result.error,
      };
      if (state.changed) {
        changes += 1;
        update.last_change_at = now;
        const who = check.client_name ? ` (${check.client_name})` : "";
        if (state.changed === "down") {
          update.incident_ticket_id = await openIncident(check, result.error);
          await notifyAdmins("downtime", {
            subject: `🔴 Caído: ${check.name}`,
            text: `🔴 ${check.name}${who} no responde\n${check.url}\n${result.error ?? ""}`.trim(),
          });
        } else {
          const since = check.last_change_at ? Math.round((Date.now() - Date.parse(check.last_change_at)) / 60_000) : null;
          await notifyAdmins("downtime", {
            subject: `🟢 Volvió: ${check.name}`,
            text: `🟢 ${check.name}${who} volvió a responder${since !== null ? ` después de ${since} min` : ""}\n${check.url}`,
          });
          if (check.incident_ticket_id) {
            await recordActivity(check.incident_ticket_id, MONITOR_ACTOR, "comment", `Volvió a responder${since !== null ? ` después de ${since} min` : ""}.`);
          }
          update.incident_ticket_id = null;
        }
      }
      if (state.status === "down") down += 1;
      await supabase.from("uptime_checks").update(update).eq("id", check.id);
    })
  );
  return { checked: checks.length, down, changes };
}
