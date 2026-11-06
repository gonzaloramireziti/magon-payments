import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { isUnlocked, reveal, VAULT_COOKIE, VaultError } from "@/lib/vault/service";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const unlocked = isUnlocked(session, request.cookies.get(VAULT_COOKIE)?.value);
    const secret = await reveal(session, unlocked, typeof body.id === "string" ? body.id : "");
    // no-store explícito: la respuesta con el secreto no se cachea en ningún lado.
    return json({ ok: true, secret }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    if (error instanceof VaultError) return errorJson(error.message, error.statusCode, error.code);
    console.error("[api/admin/vault/reveal]", error);
    return errorJson("No se pudo leer la credencial", 500, "VAULT_ERROR");
  }
}
