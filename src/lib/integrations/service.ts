import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { vaultKeyRaw } from "@/lib/env";
import { decryptSecret, encryptSecret, parseKey, VaultKeyError } from "@/lib/vault/crypto";

/**
 * Integraciones de cada usuario del panel: su token de GitHub y su API key de Anthropic.
 * Se guardan cifradas con VAULT_KEY y nunca vuelven al navegador; el panel solo muestra si
 * están conectadas (y el usuario de GitHub).
 */
export class IntegrationError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type IntegrationStatus = {
  vaultConfigured: boolean;
  github: { connected: boolean; login: string | null };
  anthropic: { connected: boolean };
};

function key(): Buffer {
  try {
    return parseKey(vaultKeyRaw);
  } catch (error) {
    if (error instanceof VaultKeyError) {
      throw new IntegrationError(
        "VAULT_NOT_CONFIGURED",
        503,
        "Falta VAULT_KEY en el servidor: sin esa clave no se pueden guardar credenciales cifradas."
      );
    }
    throw error;
  }
}

export async function getIntegrationStatus(userId: string): Promise<IntegrationStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("github_token_enc,github_login,anthropic_key_enc")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  let vaultConfigured = true;
  try {
    parseKey(vaultKeyRaw);
  } catch {
    vaultConfigured = false;
  }
  return {
    vaultConfigured,
    github: { connected: Boolean(data?.github_token_enc), login: (data?.github_login as string | null) ?? null },
    anthropic: { connected: Boolean(data?.anthropic_key_enc) },
  };
}

/** Valida el token contra GitHub y guarda el usuario al que pertenece. */
export async function saveGithubToken(userId: string, rawToken: unknown): Promise<string> {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) throw new IntegrationError("MISSING_TOKEN", 400, "Falta el token de GitHub");
  const response = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    cache: "no-store",
  });
  if (response.status === 401) throw new IntegrationError("INVALID_TOKEN", 400, "GitHub rechazó el token");
  if (!response.ok) throw new IntegrationError("GITHUB_ERROR", 502, `GitHub respondió ${response.status}`);
  const user = (await response.json()) as { login?: string };
  if (!user.login) throw new IntegrationError("GITHUB_ERROR", 502, "GitHub no devolvió el usuario");
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ github_token_enc: encryptSecret(token, key()), github_login: user.login })
    .eq("id", userId);
  if (error) throw error;
  return user.login;
}

/** Valida la key con una consulta liviana a la API (lista de modelos) antes de guardarla. */
export async function saveAnthropicKey(userId: string, rawKey: unknown): Promise<void> {
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!apiKey) throw new IntegrationError("MISSING_KEY", 400, "Falta la API key de Anthropic");
  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new IntegrationError("INVALID_KEY", 400, "Anthropic rechazó la API key");
    }
    if (error instanceof Anthropic.APIError) {
      throw new IntegrationError("ANTHROPIC_ERROR", 502, `Anthropic respondió ${error.status ?? "con error"}`);
    }
    throw error;
  }
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ anthropic_key_enc: encryptSecret(apiKey, key()) })
    .eq("id", userId);
  if (error) throw error;
}

export async function removeIntegration(userId: string, kind: "github" | "anthropic"): Promise<void> {
  const update = kind === "github" ? { github_token_enc: null, github_login: null } : { anthropic_key_enc: null };
  const { error } = await getSupabaseAdmin().from("admin_users").update(update).eq("id", userId);
  if (error) throw error;
}

async function readSecret(userId: string, column: "github_token_enc" | "anthropic_key_enc"): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("admin_users").select(column).eq("id", userId).maybeSingle();
  if (error) throw error;
  const stored = (data as Record<string, string | null> | null)?.[column];
  return stored ? decryptSecret(stored, key()) : null;
}

export async function anthropicKeyFor(userId: string): Promise<string> {
  const apiKey = await readSecret(userId, "anthropic_key_enc");
  if (!apiKey) {
    throw new IntegrationError("ANTHROPIC_NOT_CONNECTED", 400, "Conectá tu API key de Anthropic en «Mis integraciones»");
  }
  return apiKey;
}

export async function githubTokenFor(userId: string): Promise<string> {
  const token = await readSecret(userId, "github_token_enc");
  if (!token) throw new IntegrationError("GITHUB_NOT_CONNECTED", 400, "Conectá tu GitHub en «Mis integraciones»");
  return token;
}
