import type { NextRequest } from "next/server";
import { getAdminSession, isAdminRequest } from "@/lib/admin/auth";
import {
  createManualTicket,
  isMissingTable,
  listAdminTickets,
  listTicketSummaries,
  TicketError,
  updateTicket,
} from "@/lib/tickets/service";
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
  const params = new URL(request.url).searchParams;
  const includeDiscarded = params.get("discarded") === "1";
  try {
    if (params.get("summary") === "1") return okJson({ tickets: await listTicketSummaries() });
    return okJson({ tickets: await listAdminTickets(includeDiscarded) });
  } catch (error) {
    return handleError(error);
  }
}

// Alta manual desde el panel. Acepta multipart/form-data (con capturas en "attachments") o JSON.
async function readBody(request: NextRequest): Promise<{ fields: Record<string, unknown>; files: File[] }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const fields: Record<string, unknown> = {};
    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
      else if (key === "attachments" && value.size > 0) files.push(value);
    }
    return { fields, files };
  }
  return { fields: (await request.json()) as Record<string, unknown>, files: [] };
}

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  let body: { fields: Record<string, unknown>; files: File[] };
  try {
    body = await readBody(request);
  } catch {
    return errorJson("Cuerpo inválido", 400, "BAD_BODY");
  }
  try {
    return okJson({ ticket: await createManualTicket(body.fields, body.files, session) });
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
