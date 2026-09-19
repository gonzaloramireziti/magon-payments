import type { NextRequest } from "next/server";
import { getClientKeyFromRequest, requireActiveSubscription } from "@/lib/guards/requireSubscription";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientKey = getClientKeyFromRequest(request);
  if (!clientKey) return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");

  try {
    const status = await requireActiveSubscription(clientKey);
    return okJson({
      message: "Acceso permitido: suscripción activa",
      period: status.period,
      dueDate: status.dueDate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    const code = (error as { code?: string }).code ?? "ERROR";
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return errorJson(message, statusCode, code);
  }
}
