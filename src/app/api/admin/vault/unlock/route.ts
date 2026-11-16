import type { NextRequest } from "next/server";
import { isSecureRequest } from "@/lib/admin/auth";
import { unlock, VAULT_COOKIE, VaultError } from "@/lib/vault/service";
import { UNLOCK_TTL_MS } from "@/lib/vault/crypto";
import { requireActor } from "@/lib/admin/access";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function cookie(request: NextRequest, value: string, maxAge: number) {
  return {
    name: VAULT_COOKIE,
    value,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isSecureRequest(request),
    path: "/api/admin/vault",
    maxAge,
  };
}

export async function POST(request: NextRequest) {
  const session = await requireActor(request, "vault");
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = await unlock(session, typeof body.password === "string" ? body.password : "");
    const response = okJson({ unlocked: true, expiresInMs: UNLOCK_TTL_MS });
    response.cookies.set(cookie(request, token, UNLOCK_TTL_MS / 1000));
    return response;
  } catch (error) {
    if (error instanceof VaultError) return errorJson(error.message, error.statusCode, error.code);
    console.error("[api/admin/vault/unlock]", error);
    return errorJson("No se pudo desbloquear la bóveda", 500, "VAULT_ERROR");
  }
}

// Bloquear de nuevo antes de que venza.
export async function DELETE(request: NextRequest) {
  const response = okJson({ unlocked: false });
  response.cookies.set(cookie(request, "", 0));
  return response;
}
