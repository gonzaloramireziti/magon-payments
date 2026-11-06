import type { NextRequest } from "next/server";
import { getClientKeyFromRequest } from "@/lib/guards/requireSubscription";
import { getSupportConfig, TicketError } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientKey = getClientKeyFromRequest(request);
  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  const channel = new URL(request.url).searchParams.get("channel");
  try {
    return okJson({ config: await getSupportConfig(clientKey, channel) });
  } catch (error) {
    if (error instanceof TicketError) return errorJson(error.message, error.statusCode, error.code);
    console.error("[api/support/config]", error);
    return errorJson("No se pudo leer la configuración de soporte", 500, "SUPPORT_ERROR");
  }
}
