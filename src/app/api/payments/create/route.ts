import type { NextRequest } from "next/server";
import { createCheckout, SubscriptionError } from "@/lib/subscription/service";
import { getClientKeyFromRequest, subscriptionErrorResponse } from "@/lib/guards/requireSubscription";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const clientKey =
    (typeof body.clientKey === "string" ? body.clientKey : null) ??
    getClientKeyFromRequest(request);

  if (!clientKey) {
    return errorJson("Falta la KEY del cliente", 400, "MISSING_KEY");
  }

  try {
    const checkout = await createCheckout(clientKey);
    return okJson({ checkout });
  } catch (error) {
    console.error("[api/payments/create]", error);
    if (error instanceof SubscriptionError) {
      const { status, body: payload } = subscriptionErrorResponse(error);
      return errorJson(String(payload.error), status, error.code);
    }
    return errorJson("No se pudo generar el pago", 500, "CHECKOUT_ERROR");
  }
}
