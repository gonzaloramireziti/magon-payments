import type { NextRequest } from "next/server";
import { getClientKeyFromRequest } from "@/lib/guards/requireSubscription";
import { createTicket, isMissingTable, listClientTickets, TicketError } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof TicketError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) {
    return errorJson("Los reportes todavía no están habilitados", 503, "TICKETS_UNAVAILABLE");
  }
  console.error("[api/support/tickets]", error);
  return errorJson("No se pudo procesar el reporte", 500, "SUPPORT_ERROR");
}

// Acepta multipart/form-data (con capturas en "attachments") o JSON sin adjuntos.
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
  let body: { fields: Record<string, unknown>; files: File[] };
  try {
    body = await readBody(request);
  } catch {
    return errorJson("Cuerpo inválido", 400, "BAD_BODY");
  }
  const clientKey =
    (typeof body.fields.clientKey === "string" ? body.fields.clientKey : null) ??
    getClientKeyFromRequest(request);
  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");

  try {
    return okJson({ ticket: await createTicket(clientKey, body.fields, body.files) });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  const clientKey = getClientKeyFromRequest(request);
  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  try {
    return okJson({ tickets: await listClientTickets(clientKey) });
  } catch (error) {
    return handleError(error);
  }
}
