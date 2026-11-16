import type { NextRequest } from "next/server";
import { getClientKeyFromRequest } from "@/lib/guards/requireSubscription";
import { isMissingTable, TicketError } from "@/lib/tickets/service";
import { clientReply } from "@/lib/tickets/conversation";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Respuesta del cliente a su reporte desde «Mis reportes».
// Body JSON: { clientKey, number, body, reporterRef?, reporterEmail?, reporterName? }
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("Cuerpo inválido", 400, "BAD_BODY");
  }
  const clientKey = (typeof body.clientKey === "string" ? body.clientKey : null) ?? getClientKeyFromRequest(request);
  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  try {
    return okJson(await clientReply(clientKey, body));
  } catch (error) {
    if (error instanceof TicketError) return errorJson(error.message, error.statusCode, error.code);
    if (isMissingTable(error)) return errorJson("Los reportes todavía no están habilitados", 503, "TICKETS_UNAVAILABLE");
    console.error("[api/support/tickets/reply]", error);
    return errorJson("No se pudo enviar la respuesta", 500, "SUPPORT_ERROR");
  }
}
