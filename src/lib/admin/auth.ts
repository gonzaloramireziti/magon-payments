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

export function createSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
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
