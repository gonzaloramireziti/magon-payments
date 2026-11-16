import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// El módulo lee las variables al cargarse: se fija el entorno y se importa de nuevo en cada test.
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ["GALIOPAY_WEBHOOK_SECRET", "GALIOPAY_WEBHOOK_TOKEN", "GALIOPAY_MODE"]) delete process.env[key];
  Object.assign(process.env, env);
  return import("./webhook");
}

const body = JSON.stringify({ id: "pay_1", status: "approved", amount: 1000, referenceId: "ref-1", date: "2026-02-25T13:59:40.406Z" });
const url = new URL("https://pay.magon.com/api/webhooks/galiopay");

function sign(secret: string, payload: string, timestamp?: string) {
  return createHmac("sha256", secret).update(timestamp ? `${timestamp}.${payload}` : payload).digest("hex");
}

describe("firma del webhook de GalioPay", () => {
  beforeEach(() => vi.useRealTimers());

  it("acepta una firma HMAC válida con timestamp", async () => {
    const { verifyWebhookSignature } = await load({ GALIOPAY_WEBHOOK_SECRET: "s3cret", GALIOPAY_MODE: "live" });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = new Headers({ "x-galiopay-signature": `v1=${sign("s3cret", body, ts)}`, "x-galiopay-timestamp": ts });
    expect(verifyWebhookSignature(body, headers, url).ok).toBe(true);
  });

  it("rechaza si el cuerpo fue alterado", async () => {
    const { verifyWebhookSignature } = await load({ GALIOPAY_WEBHOOK_SECRET: "s3cret", GALIOPAY_MODE: "live" });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = new Headers({ "x-galiopay-signature": `v1=${sign("s3cret", body, ts)}`, "x-galiopay-timestamp": ts });
    expect(verifyWebhookSignature(body.replace("1000", "1"), headers, url).ok).toBe(false);
  });

  it("rechaza un timestamp viejo (replay)", async () => {
    const { verifyWebhookSignature } = await load({ GALIOPAY_WEBHOOK_SECRET: "s3cret", GALIOPAY_MODE: "live" });
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const headers = new Headers({ "x-galiopay-signature": `v1=${sign("s3cret", body, ts)}`, "x-galiopay-timestamp": ts });
    const result = verifyWebhookSignature(body, headers, url);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("timestamp");
  });

  it("acepta el token compartido y rechaza uno distinto", async () => {
    const { verifyWebhookSignature } = await load({ GALIOPAY_WEBHOOK_TOKEN: "tok", GALIOPAY_MODE: "live" });
    expect(verifyWebhookSignature(body, new Headers({ "x-galiopay-token": "tok" }), url).ok).toBe(true);
    expect(verifyWebhookSignature(body, new Headers({ "x-galiopay-token": "otro" }), url).ok).toBe(false);
  });

  it("en modo live sin secreto ni token, rechaza", async () => {
    const { verifyWebhookSignature } = await load({ GALIOPAY_MODE: "live" });
    expect(verifyWebhookSignature(body, new Headers(), url).ok).toBe(false);
  });

  it("normaliza el payload de transferencia", async () => {
    const { normalizeTransferPayload } = await load({ GALIOPAY_MODE: "mock" });
    const t = normalizeTransferPayload(JSON.parse(body));
    expect(t.providerPaymentId).toBe("pay_1");
    expect(t.referenceId).toBe("ref-1");
    expect(t.status).toBe("approved");
    expect(t.amount).toBe(1000);
    expect(t.eventId).toBe("pay_1:approved:2026-02-25T13:59:40.406Z");
  });
});
