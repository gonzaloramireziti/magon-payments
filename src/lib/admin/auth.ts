import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  adminApiKey,
  adminPassword,
  adminSessionSecret,
  adminUsername,
} from "@/lib/env";

export const ADMIN_COOKIE = "magon_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sessionSecret(): string {
  return adminSessionSecret || adminPassword || adminApiKey || "magon-insecure-dev";
}

function password(): string {
  return adminPassword || adminApiKey;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function adminLoginEnabled(): boolean {
  return password() !== "";
}

// Usuario de la sesión. "env" es el acceso de emergencia con ADMIN_USERNAME / ADMIN_PASSWORD,
// que no tiene fila en admin_users.
export type AdminSession = { userId: string | null; name: string; email: string | null };

export const ENV_USER_ID = "env";

export function createSessionToken(user: { id: string; name: string; email?: string | null }): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: user.id,
      n: user.name,
      e: user.email ?? null,
      exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: string;
      n?: string;
      e?: string | null;
      exp?: number;
    };
    if (typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    const id = typeof data.u === "string" ? data.u : ENV_USER_ID;
    return {
      userId: id === ENV_USER_ID ? null : id,
      name: data.n ?? "Administrador",
      email: data.e ?? null,
    };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string | undefined | null): boolean {
  return readSessionToken(token) !== null;
}

export function getAdminSession(request: NextRequest): AdminSession | null {
  return readSessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
}

export function checkCredentials(username: string, candidate: string): boolean {
  if (!adminLoginEnabled()) return false;
  return safeEqual(username, adminUsername) && safeEqual(candidate, password());
}

export function isAdminRequest(request: NextRequest): boolean {
  if (verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-admin-key") ??
    null;
  return Boolean(provided && adminApiKey && safeEqual(provided, adminApiKey));
}

export function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return request.nextUrl.protocol === "https:";
}

export const ADMIN_SESSION_MAX_AGE = SESSION_TTL_SECONDS;
