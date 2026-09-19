"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS, Card, ghost, money } from "./ui";

type Totals = { ars: number; usd: number; totalUsd: number; totalArs: number };

type Dashboard = {
  rate: { usd: number; source: string; updatedAt: string; available: boolean };
  earnings: Totals;
  collected: Totals;
  costs: Totals;
  net: { totalUsd: number; totalArs: number };
  debt: Totals & { clients: number };
  clientsCount: number;
  costsCount: number;
};

const CURRENCY_STORAGE_KEY = "magon.admin.currency";

export function AdminStats({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [showArs, setShowArs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (saved !== null) setShowArs(saved === "ARS");
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  const toggleCurrency = useCallback(() => {
    setShowArs((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(CURRENCY_STORAGE_KEY, next ? "ARS" : "USD");
      } catch {
        /* localStorage no disponible */
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error ?? "Error");
      setData(json as Dashboard);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const fmt = (usd: number, ars: number) => (showArs ? money(ars, "ARS") : money(usd, "USD"));

  return (
    <section style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Resumen mensual</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={ghost} onClick={toggleCurrency}>
            {showArs ? "Ver en USD" : "Ver en ARS"}
          </button>
          <button style={ghost} onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      {error && <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && !data && <div style={{ color: COLORS.muted, fontSize: 13 }}>Calculando...</div>}

      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <Card
              title="Ganancias fijas en USD"
              value={money(data.earnings.usd, "USD")}
              hint={`${data.clientsCount} cliente(s) activo(s)`}
            />
            <Card title="Ganancias fijas en ARS" value={money(data.earnings.ars, "ARS")} />
            <Card
              title={`Ganancias fijas totales (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.earnings.totalUsd, data.earnings.totalArs)}
              hint={data.rate.available ? `Dólar oficial: $${data.rate.usd.toFixed(2)}` : "Sin cotización"}
            />
            <Card
              title={`Costos fijos (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.costs.totalUsd, data.costs.totalArs)}
              hint={`${data.costsCount} costo(s) · ARS ${money(data.costs.ars, "ARS")} + USD ${money(data.costs.usd, "USD")}`}
            />
            <Card
              title={`Ganancia final mensual (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.net.totalUsd, data.net.totalArs)}
              color={data.net.totalUsd >= 0 ? COLORS.ok : COLORS.danger}
            />
            <Card
              title={`Deuda actual (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.debt.totalUsd, data.debt.totalArs)}
              color={COLORS.danger}
              hint={`${data.debt.clients} cliente(s) con saldo`}
            />
          </div>

          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 10 }}>
            {data.rate.available
              ? `Cotización dólar oficial: $${data.rate.usd.toFixed(2)} (${data.rate.source})`
              : "Cotización no disponible: configurá USD_RATE_FALLBACK para convertir."}
            {" · "}
            {`Cobrado este mes: ${money(data.collected.ars, "ARS")} + ${money(data.collected.usd, "USD")}`}
          </div>
        </>
      )}
    </section>
  );
}
