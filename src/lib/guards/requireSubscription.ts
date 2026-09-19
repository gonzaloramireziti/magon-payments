import { getSubscriptionStatus, SubscriptionError, type SubscriptionStatus } from "@/lib/subscription/service";

export function getClientKeyFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get("key") ??
    url.searchParams.get("clientKey") ??
    request.headers.get("x-magon-client-key") ??
    null
  );
}

export async function requireActiveSubscription(clientKey: string): Promise<SubscriptionStatus> {
  const status = await getSubscriptionStatus(clientKey);
  if (!status.found) {
    throw new SubscriptionError("CLIENT_NOT_FOUND", 404, "Cliente no encontrado");
  }
  if (status.state === "inactive") {
    throw new SubscriptionError("CLIENT_INACTIVE", 403, "Cliente inactivo");
  }
  if (status.blocked) {
    throw new SubscriptionError(
      "SUBSCRIPTION_BLOCKED",
      402,
      `Suscripción vencida. Saldo pendiente: ${status.amountDue} ${status.currency}`
    );
  }
  return status;
}

export function subscriptionErrorResponse(error: unknown) {
  if (error instanceof SubscriptionError) {
    return { status: error.statusCode, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { ok: false, error: "Error interno", code: "INTERNAL_ERROR" },
  };
}
