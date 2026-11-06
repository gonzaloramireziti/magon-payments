import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { vaultKeyRaw } from "@/lib/env";
import type { AdminSession } from "@/lib/admin/auth";
import { verifyUserPassword } from "@/lib/admin/users";
import { createUnlockToken, decryptSecret, encryptSecret, parseKey, verifyUnlockToken, VaultKeyError } from "@/lib/vault/crypto";

export const VAULT_COOKIE = "magon_vault";
const KINDS = ["server", "database", "api", "panel", "email", "other"] as const;
type Kind = (typeof KINDS)[number];

export class VaultError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function key(): Buffer {
  try {
    return parseKey(vaultKeyRaw);
  } catch (error) {
    if (error instanceof VaultKeyError) throw new VaultError("VAULT_NOT_CONFIGURED", 503, error.message);
    throw error;
  }
}

export function vaultConfigured(): boolean {
  try {
    parseKey(vaultKeyRaw);
    return true;
  } catch {
    return false;
  }
}

// La bóveda solo la usan usuarios con nombre: el acceso de emergencia no ve credenciales.
function requireUser(session: AdminSession): string {
  if (!session.userId) {
    throw new VaultError("EMERGENCY_SESSION", 403, "Entrá con tu usuario para usar la bóveda");
  }
  return session.userId;
}

export function isUnlocked(session: AdminSession, token: string | undefined): boolean {
  if (!session.userId || !vaultConfigured()) return false;
  return verifyUnlockToken(token, session.userId, key());
}

async function audit(session: AdminSession, action: string, item?: { id: string | null; name: string | null }) {
  const { error } = await getSupabaseAdmin().from("vault_access_log").insert({
    item_id: item?.id ?? null,
    item_name: item?.name ?? null,
    user_id: session.userId,
    user_name: session.name,
    action,
  });
  if (error) console.error("[vault] no se pudo auditar", error.message);
}

export async function unlock(session: AdminSession, password: string): Promise<string> {
  const userId = requireUser(session);
  const k = key();
  if (!(await verifyUserPassword(userId, password))) {
    await audit(session, "unlock_failed");
    throw new VaultError("WRONG_PASSWORD", 401, "Contraseña incorrecta");
  }
  await audit(session, "unlock");
  return createUnlockToken(userId, k);
}

export type VaultItem = {
  id: string;
  name: string;
  kind: Kind;
  client_id: string | null;
  client_name: string | null;
  host: string | null;
  username: string | null;
  has_secret: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

// Lista sin secretos: el secreto solo sale por reveal(), con la bóveda desbloqueada.
export async function listItems(): Promise<VaultItem[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("vault_items")
    .select("id,name,kind,client_id,host,username,secret_enc,notes,updated_by,updated_at,clients(name)")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { secret_enc, clients, ...rest } = row as typeof row & { clients: { name: string } | null };
    return {
      ...(rest as Omit<VaultItem, "has_secret" | "client_name">),
      client_name: clients?.name ?? null,
      has_secret: Boolean(secret_enc),
    };
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function saveItem(session: AdminSession, unlocked: boolean, raw: Record<string, unknown>) {
  requireUser(session);
  if (!unlocked) throw new VaultError("VAULT_LOCKED", 403, "Desbloqueá la bóveda para guardar credenciales");
  const name = text(raw.name, 120);
  if (!name) throw new VaultError("MISSING_NAME", 400, "Falta el nombre");
  const kind = KINDS.includes(raw.kind as Kind) ? (raw.kind as Kind) : "other";
  const row: Record<string, unknown> = {
    name,
    kind,
    client_id: typeof raw.clientId === "string" && raw.clientId ? raw.clientId : null,
    host: text(raw.host, 300),
    username: text(raw.username, 200),
    notes: text(raw.notes, 4000),
    updated_by: session.name,
  };
  // El secreto solo se toca si viene: así se puede editar el resto sin re-escribirlo.
  if (typeof raw.secret === "string") row.secret_enc = raw.secret ? encryptSecret(raw.secret, key()) : null;

  const supabase = getSupabaseAdmin();
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const { data, error } = id
    ? await supabase.from("vault_items").update(row).eq("id", id).select("id,name").single()
    : await supabase.from("vault_items").insert(row).select("id,name").single();
  if (error) throw error;
  await audit(session, id ? "update" : "create", { id: data.id as string, name: data.name as string });
  return data;
}

export async function deleteItem(session: AdminSession, unlocked: boolean, id: string) {
  requireUser(session);
  if (!unlocked) throw new VaultError("VAULT_LOCKED", 403, "Desbloqueá la bóveda para borrar credenciales");
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("vault_items").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("vault_items").delete().eq("id", id);
  if (error) throw error;
  await audit(session, "delete", { id: null, name: (data?.name as string | undefined) ?? null });
}

export async function reveal(session: AdminSession, unlocked: boolean, id: string): Promise<string> {
  requireUser(session);
  if (!unlocked) throw new VaultError("VAULT_LOCKED", 403, "Desbloqueá la bóveda para ver credenciales");
  const { data, error } = await getSupabaseAdmin()
    .from("vault_items")
    .select("id,name,secret_enc")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.secret_enc) throw new VaultError("NO_SECRET", 404, "Esta credencial no tiene secreto guardado");
  const secret = decryptSecret(data.secret_enc as string, key());
  await audit(session, "reveal", { id: data.id as string, name: data.name as string });
  return secret;
}

export async function accessLog(limit = 50) {
  const { data, error } = await getSupabaseAdmin()
    .from("vault_access_log")
    .select("item_name,user_name,action,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
