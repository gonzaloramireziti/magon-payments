import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { createUser, listUsers, resetInvite, setUserActive, setUserRole, UserError } from "@/lib/admin/users";
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

// La lista la ven todos (hace falta para asignar tickets); crear y editar, solo con "manage".
export async function GET(request: NextRequest) {
  const guard = await requireActor(request);
  if (guard instanceof Response) return guard;
  try {
    return okJson({ users: await listUsers() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { user, invite } = await createUser(body.name, body.email, body.role);
    return okJson({ user, inviteUrl: inviteUrl(request, invite.token), expiresAt: invite.expiresAt });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireActor(request, "manage");
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return errorJson("Falta el id del usuario", 400, "MISSING_ID");
    if (body.resetInvite === true) {
      const invite = await resetInvite(id);
      return okJson({ inviteUrl: inviteUrl(request, invite.token), expiresAt: invite.expiresAt });
    }
    if (body.role !== undefined) {
      return okJson({ user: await setUserRole(id, body.role, session.userId) });
    }
    if (typeof body.active === "boolean") {
      return okJson({ user: await setUserActive(id, body.active, session.userId) });
    }
    return errorJson("Nada para actualizar", 400, "EMPTY_UPDATE");
  } catch (error) {
    return handleError(error);
  }
}
