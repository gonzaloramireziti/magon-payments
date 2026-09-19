import { appUrl, assertGaliopayConfigured, galiopay } from "@/lib/env";

export type CreatePaymentInput = {
  amount: number;
  currency: string;
  referenceId: string;
  paymentId: string;
  description: string;
  webhookUrl: string;
  callbackUrl: string;
  payer?: { name?: string; email?: string };
};

export type CreatePaymentResult = {
  providerPaymentId: string | null;
  providerStatus: string | null;
  checkoutUrl: string | null;
  qrData: string | null;
  expiresAt: string | null;
  raw: unknown;
};

function pick(source: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const { apiKey, clientId, authMode, apiKeyHeader } = galiopay;
  if (clientId) headers["x-client-id"] = clientId;
  switch (authMode) {
    case "bearer":
      headers.authorization = `Bearer ${apiKey}`;
      break;
    case "header":
      headers[apiKeyHeader] = apiKey;
      break;
    case "basic":
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${apiKey}`).toString("base64")}`;
      break;
    case "body":
      break;
  }
  return headers;
}

function buildRequestBody(input: CreatePaymentInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    items: [
      {
        title: input.description,
        quantity: 1,
        unitPrice: input.amount,
        currencyId: input.currency,
      },
    ],
    referenceId: input.referenceId,
    notificationUrl: input.webhookUrl,
    backUrl: {
      success: input.callbackUrl,
      failure: input.callbackUrl,
    },
    sandbox: galiopay.sandbox,
  };
  if (galiopay.authMode === "body") {
    body.apiKey = galiopay.apiKey;
    body.clientId = galiopay.clientId;
  }
  return body;
}

function normalizeResponse(payload: unknown, input: CreatePaymentInput): CreatePaymentResult {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root.data ?? root.payment ?? root) as Record<string, unknown>;
  const providerPaymentId =
    asString(pick(data, ["id", "paymentId", "payment_id", "transactionId", "transaction_id"])) ??
    asString(pick(root, ["id", "paymentId", "payment_id"]));
  const checkoutUrl =
    asString(
      pick(data, [
        "checkoutUrl",
        "checkout_url",
        "initPoint",
        "init_point",
        "url",
        "link",
        "paymentUrl",
        "payment_url",
      ])
    ) ?? asString(pick(root, ["checkoutUrl", "checkout_url", "url", "link"]));
  const qrData =
    asString(
      pick(data, ["qr", "qrCode", "qr_code", "qrData", "qr_data", "qrString", "emv", "cbu"])
    ) ?? asString(pick(root, ["qr", "qrCode", "qr_code", "qrData", "qr_data"]));
  const providerStatus =
    asString(pick(data, ["status", "state"])) ?? asString(pick(root, ["status", "state"])) ?? "pending";
  const expiresAt =
    asString(pick(data, ["expiresAt", "expires_at", "expiration", "dueDate"])) ?? null;

  const linkId = checkoutUrl
    ? (checkoutUrl.split("/payment/")[1]?.split("?")[0] ?? null)
    : null;

  return {
    providerPaymentId: providerPaymentId ?? linkId,
    providerStatus,
    checkoutUrl: checkoutUrl ?? (qrData ? null : input.callbackUrl),
    qrData: qrData ?? null,
    expiresAt,
    raw: payload,
  };
}

export async function createGalioPayPayment(
  input: CreatePaymentInput
): Promise<CreatePaymentResult> {
  if (!galiopay.isLive) {
    const base = appUrl.replace(/\/$/, "");
    const url = `${base}/mock-checkout?ref=${encodeURIComponent(input.referenceId)}&amount=${input.amount}&currency=${encodeURIComponent(input.currency)}`;
    return {
      providerPaymentId: `mock_${input.paymentId}`,
      providerStatus: "pending",
      checkoutUrl: url,
      qrData: url,
      expiresAt: null,
      raw: { mock: true, input },
    };
  }

  assertGaliopayConfigured();

  const endpoint = `${galiopay.baseUrl.replace(/\/$/, "")}${galiopay.createPaymentPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), galiopay.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify(buildRequestBody(input)),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { rawText: text };
    }

    if (!response.ok) {
      throw new Error(
        `GalioPay respondió ${response.status}: ${typeof text === "string" ? text.slice(0, 500) : ""}`
      );
    }

    return normalizeResponse(payload, input);
  } finally {
    clearTimeout(timeout);
  }
}
