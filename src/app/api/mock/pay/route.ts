import type { NextRequest } from "next/server";
import { galiopay } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processGalioPayWebhook } from "@/lib/galiopay/webhook";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (galiopay.isLive) {
    return errorJson("Endpoint disponible solo en modo mock", 403, "MOCK_DISABLED");
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const reference = typeof body.reference === "string" ? body.reference : "";
  if (!reference) return errorJson("Falta reference", 400, "MISSING_REFERENCE");

  const supabase = getSupabaseAdmin();
  const { data: payment } = await supabase
    .from("payments")
    .select("id,amount,currency,provider_status")
    .eq("reference_id", reference)
    .maybeSingle();

  if (!payment) return errorJson("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");

  const now = new Date().toISOString();
  const amount = Number(payment.amount);
  const payload = {
    id: `mock_${Date.now()}`,
    paymentMethodId: "TRANSFER",
    amount,
    netAmount: Math.round(amount * 0.97 * 100) / 100,
    moneyReleaseDate: now,
    status: "approved",
    currency: payment.currency,
    date: now,
    referenceId: reference,
  };

  const result = await processGalioPayWebhook(JSON.stringify(payload));
  return okJson({ result, payload });
}
