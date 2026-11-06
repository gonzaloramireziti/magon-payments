import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  accessLog,
  deleteItem,
  isUnlocked,
  listItems,
  saveItem,
  VAULT_COOKIE,
  vaultConfigured,
  VaultError,
} from "@/lib/vault/service";
import { isMissingTable } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof VaultError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson("Falta correr la migración 006", 503, "VAULT_UNAVAILABLE");
  console.error("[api/admin/vault]", error);
  return errorJson("No se pudo procesar la bóveda", 500, "VAULT_ERROR");
}

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const unlocked = isUnlocked(session, request.cookies.get(VAULT_COOKIE)?.value);
    return okJson({
      configured: vaultConfigured(),
      canUse: Boolean(session.userId),
      unlocked,
      items: await listItems(),
      log: unlocked ? await accessLog() : [],
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const unlocked = isUnlocked(session, request.cookies.get(VAULT_COOKIE)?.value);
    return okJson({ item: await saveItem(session, unlocked, (await request.json()) as Record<string, unknown>) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const unlocked = isUnlocked(session, request.cookies.get(VAULT_COOKIE)?.value);
    await deleteItem(session, unlocked, request.nextUrl.searchParams.get("id") ?? "");
    return okJson({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
