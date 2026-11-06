import type { NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminLoginEnabled,
  checkCredentials,
  createSessionToken,
  ENV_USER_ID,
  isSecureRequest,
} from "@/lib/admin/auth";
import { authenticate } from "@/lib/admin/users";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Primero los usuarios del panel (por email); después el acceso de emergencia de las variables
  // de entorno, que sirve para dar de alta al primer usuario.
  let user: { id: string; name: string; email: string | null } | null = null;
  try {
    const found = await authenticate(username, password);
    if (found) user = { id: found.id, name: found.name, email: found.email };
  } catch (error) {
    console.error("[api/admin/login]", error);
  }
  if (!user && adminLoginEnabled() && checkCredentials(username, password)) {
    user = { id: ENV_USER_ID, name: "Administrador", email: null };
  }
  if (!user) return errorJson("Email o contraseña incorrectos", 401, "INVALID_CREDENTIALS");

  const response = okJson({ authenticated: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: createSessionToken(user),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}
