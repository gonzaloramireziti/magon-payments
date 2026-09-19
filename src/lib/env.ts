export function required(name: string, value: string | undefined | null): string {
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? appUrl;

export const galiopay = {
  mode: (process.env.GALIOPAY_MODE ?? "mock") as "mock" | "live",
  baseUrl: process.env.GALIOPAY_API_BASE_URL ?? "",
  createPaymentPath: process.env.GALIOPAY_CREATE_PAYMENT_PATH ?? "/v1/payments",
  clientId: process.env.GALIOPAY_CLIENT_ID ?? "",
  apiKey: process.env.GALIOPAY_API_KEY ?? "",
  authMode: (process.env.GALIOPAY_AUTH_MODE ?? "bearer") as
    | "bearer"
    | "header"
    | "basic"
    | "body",
  apiKeyHeader: process.env.GALIOPAY_API_KEY_HEADER ?? "x-api-key",
  webhookSecret: process.env.GALIOPAY_WEBHOOK_SECRET ?? "",
  webhookToken: process.env.GALIOPAY_WEBHOOK_TOKEN ?? "",
  webhookToleranceSeconds: Number(process.env.GALIOPAY_WEBHOOK_TOLERANCE ?? 300),
  currency: process.env.GALIOPAY_CURRENCY ?? "ARS",
  sandbox: bool(process.env.GALIOPAY_SANDBOX, false),
  timeoutMs: Number(process.env.GALIOPAY_TIMEOUT_MS ?? 15000),
  isLive: (process.env.GALIOPAY_MODE ?? "mock") === "live",
};

export const subscription = {
  dueDay: Number(process.env.SUBSCRIPTION_DUE_DAY ?? 10),
  timezone: process.env.SUBSCRIPTION_TIMEZONE ?? "America/Argentina/Buenos_Aires",
};

export const adminApiKey = process.env.ADMIN_API_KEY ?? "";
export const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
export const adminPassword = process.env.ADMIN_PASSWORD ?? "";
export const adminSessionSecret = process.env.ADMIN_SESSION_SECRET ?? "";
export const cronSecret = process.env.CRON_SECRET ?? "";
export const corsOrigins = process.env.CORS_ORIGINS ?? "*";

export function supabaseConfig(): { url: string; serviceRoleKey: string } {
  return {
    url: required("SUPABASE_URL", process.env.SUPABASE_URL),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function webhookUrl(): string {
  return `${appUrl.replace(/\/$/, "")}/api/webhooks/galiopay`;
}

export function assertGaliopayConfigured(): void {
  if (!galiopay.isLive) return;
  required("GALIOPAY_API_BASE_URL", galiopay.baseUrl);
  required("GALIOPAY_CLIENT_ID", galiopay.clientId);
  required("GALIOPAY_API_KEY", galiopay.apiKey);
}

export function debugFlag(): boolean {
  return bool(process.env.MAGON_DEBUG, false);
}
