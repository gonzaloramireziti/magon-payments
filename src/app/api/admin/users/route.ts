import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createUser, listUsers, resetInvite, setUserActive, UserError } from "@/lib/admin/users";
import { isMissingTable } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof UserError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson("Falta correr la migración 004", 503, "USERS_UNAVAILABLE");
  console.error("[api/admin/users]", error);
  return errorJson("No se pudo procesar el usuario", 500, "USERS_ERROR");
}

function inviteUrl(request: NextRequest, token: string): string {
  return `${request.nextUrl.origin}/admin/invitacion?token=${encodeURIComponent(token)}`;
}

export async function GET(request: NextRequest) {
  if (!getAdminSession(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    return okJson({ users: await listUsers() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!getAdminSession(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { user, invite } = await createUser(body.name, body.email);
    return okJson({ user, inviteUrl: inviteUrl(request, invite.token), expiresAt: invite.expiresAt });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return errorJson("Falta el id del usuario", 400, "MISSING_ID");
    if (body.resetInvite === true) {
      const invite = await resetInvite(id);
      return okJson({ inviteUrl: inviteUrl(request, invite.token), expiresAt: invite.expiresAt });
    }
    if (typeof body.active === "boolean") {
      return okJson({ user: await setUserActive(id, body.active, session.userId) });
    }
    return errorJson("Nada para actualizar", 400, "EMPTY_UPDATE");
  } catch (error) {
    return handleError(error);
  }
}
