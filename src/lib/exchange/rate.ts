import { usdRateApi, usdRateFallback } from "@/lib/env";

export type UsdRate = {
  rate: number;
  source: string;
  updatedAt: string;
};

export async function getUsdRate(): Promise<UsdRate> {
  try {
    const response = await fetch(usdRateApi, {
      next: { revalidate: 600 },
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      const rate = Number(data.venta ?? data.compra ?? data.value ?? data.rate);
      if (Number.isFinite(rate) && rate > 0) {
        return {
          rate,
          source: usdRateApi,
          updatedAt:
            (typeof data.fechaActualizacion === "string" && data.fechaActualizacion) ||
            new Date().toISOString(),
        };
      }
    }
  } catch (error) {
    console.warn("[exchange] no se pudo obtener la cotización:", error);
  }

  return {
    rate: usdRateFallback > 0 ? usdRateFallback : 0,
    source: usdRateFallback > 0 ? "fallback (USD_RATE_FALLBACK)" : "no disponible",
    updatedAt: new Date().toISOString(),
  };
}
