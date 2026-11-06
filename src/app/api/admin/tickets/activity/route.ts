import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { addComment, listActivity, TicketError } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof TicketError) return errorJson(error.message, error.statusCode, error.code);
  console.error("[api/admin/tickets/activity]", error);
  return errorJson("No se pudo leer la actividad del ticket", 500, "ACTIVITY_ERROR");
}

export async function GET(request: NextRequest) {
  if (!getAdminSession(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const ticketId = request.nextUrl.searchParams.get("ticketId") ?? "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson({ activity: await listActivity(ticketId) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    await addComment(typeof body.ticketId === "string" ? body.ticketId : "", body.body, session);
    return okJson({ activity: await listActivity(body.ticketId as string) });
  } catch (error) {
    return handleError(error);
  }
}
