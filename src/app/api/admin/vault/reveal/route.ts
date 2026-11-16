import type { NextRequest } from "next/server";
import { isUnlocked, reveal, VAULT_COOKIE, VaultError } from "@/lib/vault/service";
import { requireActor } from "@/lib/admin/access";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requireActor(request, "vault");
  if (session instanceof Response) return session;
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
