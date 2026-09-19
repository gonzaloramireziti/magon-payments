import type { NextRequest } from "next/server";
import { processGalioPayWebhook, verifyWebhookSignature } from "@/lib/galiopay/webhook";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const url = new URL(request.url);

  const verification = verifyWebhookSignature(rawBody, request.headers, url);
  if (!verification.ok) {
    console.warn("[api/webhooks/galiopay] rechazado:", verification.reason);
    return errorJson(verification.reason ?? "Webhook no autorizado", 401, "INVALID_SIGNATURE");
  }

  try {
    const result = await processGalioPayWebhook(rawBody);
    return okJson({ result });
  } catch (error) {
    console.error("[api/webhooks/galiopay]", error);
    return errorJson("Error procesando el webhook", 500, "WEBHOOK_ERROR");
  }
}

export async function GET() {
  return okJson({ status: "ready" });
}
