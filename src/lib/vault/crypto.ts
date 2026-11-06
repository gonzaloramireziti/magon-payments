// Cifrado de la bóveda: AES-256-GCM. La clave se recibe por parámetro (sale de VAULT_KEY en el
// servidor), así este módulo se prueba sin el framework y nunca lee variables por su cuenta.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

export class VaultKeyError extends Error {}

// VAULT_KEY: 32 bytes en base64 (se genera con `openssl rand -base64 32`).
export function parseKey(raw: string | undefined | null): Buffer {
  if (!raw) throw new VaultKeyError("Falta la variable VAULT_KEY");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new VaultKeyError("VAULT_KEY tiene que ser de 32 bytes en base64");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Formato de secreto desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// Desbloqueo de la bóveda: token firmado con la misma clave, atado al usuario y con vencimiento.
export const UNLOCK_TTL_MS = 15 * 60 * 1000;

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(`vault-unlock:${payload}`).digest("base64url");
}

export function createUnlockToken(userId: string, key: Buffer, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: now + UNLOCK_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyUnlockToken(token: string | undefined | null, userId: string, key: Buffer, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    return data.u === userId && typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}
