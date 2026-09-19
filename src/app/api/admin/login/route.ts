import type { NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminLoginEnabled,
  checkCredentials,
  createSessionToken,
  isSecureRequest,
} from "@/lib/admin/auth";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!adminLoginEnabled()) {
    return errorJson(
      "Login deshabilitado: configurá ADMIN_PASSWORD (o ADMIN_API_KEY)",
      503,
      "LOGIN_DISABLED"
    );
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!checkCredentials(username, password)) {
    return errorJson("Credenciales inválidas", 401, "INVALID_CREDENTIALS");
  }

  const response = okJson({ authenticated: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: createSessionToken(username),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}
