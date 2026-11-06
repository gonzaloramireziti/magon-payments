import type { NextRequest } from "next/server";
import { getAdminSession, isAdminRequest } from "@/lib/admin/auth";
import { isMissingTable, listAdminTickets, TicketError, updateTicket } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof TicketError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) {
    return errorJson("Falta correr la migración de tickets", 503, "TICKETS_UNAVAILABLE");
  }
  console.error("[api/admin/tickets]", error);
  return errorJson("No se pudieron procesar los tickets", 500, "TICKETS_ERROR");
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const includeDiscarded = new URL(request.url).searchParams.get("discarded") === "1";
  try {
    return okJson({ tickets: await listAdminTickets(includeDiscarded) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("JSON inválido", 400, "BAD_JSON");
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return errorJson("Falta el id del ticket", 400, "MISSING_ID");
  try {
    return okJson({ ticket: await updateTicket(id, body, session) });
  } catch (error) {
    return handleError(error);
  }
}
