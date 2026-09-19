import type { NextRequest } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import { getClientKeyFromRequest } from "@/lib/guards/requireSubscription";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientKey = getClientKeyFromRequest(request);
  if (!clientKey) {
    return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  }

  try {
    const status = await getSubscriptionStatus(clientKey);
    return okJson({ status });
  } catch (error) {
    console.error("[api/subscription/status]", error);
    return errorJson("No se pudo obtener el estado de la suscripción", 500, "STATUS_ERROR");
  }
}
