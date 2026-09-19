"use client";

import { useCallback, useEffect, useState } from "react";
import { COLORS, Card, ghost, money } from "./ui";

type Totals = { ars: number; usd: number; totalUsd: number; totalArs: number };

type Dashboard = {
  period: "month" | "all";
  rate: { usd: number; source: string; updatedAt: string; available: boolean };
  earnings: Totals;
  costs: Totals;
  net: { totalUsd: number; totalArs: number };
  debt: Totals & { clients: number };
  costsCount: number;
};

export function AdminStats({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [showArs, setShowArs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/dashboard?period=${period}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error ?? "Error");
      setData(json as Dashboard);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

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
        <h2 style={{ margin: 0, fontSize: 16 }}>Resumen</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as "month" | "all")}
            style={{ ...ghost, paddingRight: 10 }}
          >
            <option value="month">Mes actual</option>
            <option value="all">Total histórico</option>
          </select>
          <button style={ghost} onClick={() => setShowArs((value) => !value)}>
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
            <Card title="Ganancias en USD" value={money(data.earnings.usd, "USD")} />
            <Card title="Ganancias en ARS" value={money(data.earnings.ars, "ARS")} />
            <Card
              title={`Ganancias totales (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.earnings.totalUsd, data.earnings.totalArs)}
              hint={data.rate.available ? `Dólar oficial: $${data.rate.usd.toFixed(2)}` : "Sin cotización"}
            />
            <Card
              title={`Costos fijos (${showArs ? "ARS" : "USD"})`}
              value={fmt(data.costs.totalUsd, data.costs.totalArs)}
              hint={`${data.costsCount} costo(s) · ARS ${money(data.costs.ars, "ARS")} + USD ${money(data.costs.usd, "USD")}`}
            />
            <Card
              title={`Ganancia final (${showArs ? "ARS" : "USD"})`}
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
            {data.period === "month" ? "Ganancias del mes actual" : "Ganancias históricas"}
          </div>
        </>
      )}
    </section>
  );
}
