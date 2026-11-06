"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS, Section, fetchJson, ghost, input, money, panel, td, th } from "./ui";

type Payment = {
  id: string;
  clientId: string;
  clientName: string;
  provider: string;
  status: string;
  method: string | null;
  amount: number;
  netAmount: number | null;
  currency: string;
  period: string | null;
  note: string | null;
  createdAt: string;
};

type ClientOption = { id: string; name: string };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  approved: { label: "Acreditado", color: COLORS.ok },
  pending: { label: "Pendiente", color: COLORS.warn },
  rejected: { label: "Rechazado", color: COLORS.danger },
  cancelled: { label: "Cancelado", color: COLORS.muted },
  canceled: { label: "Cancelado", color: COLORS.muted },
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminPayments({ reloadKey }: { reloadKey: number }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("approved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ clients: ClientOption[] }>("/api/admin/clients")
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [reloadKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (clientId) params.set("clientId", clientId);
    if (status) params.set("status", status);
    try {
      const data = await fetchJson<{ payments: Payment[] }>(`/api/admin/payments?${params}`);
      setPayments(data.payments);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month, clientId, status]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const totals = useMemo(() => {
    const result = { ARS: 0, USD: 0 };
    for (const payment of payments) {
      if (payment.status !== "approved") continue;
      if (payment.currency === "USD") result.USD += payment.amount;
      else result.ARS += payment.amount;
    }
    return result;
  }, [payments]);

  return (
    <Section
      title="Cobros"
      subtitle={`${payments.length} movimiento(s) · acreditado ${money(totals.ARS, "ARS")}${
        totals.USD ? ` + ${money(totals.USD, "USD")}` : ""
      }`}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 14,
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase" }}>Mes</span>
          <input style={input} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase" }}>Cliente</span>
          <select style={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase" }}>Estado</span>
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="approved">Acreditados</option>
            <option value="pending">Pendientes</option>
            <option value="">Todos</option>
          </select>
        </label>
        <button style={ghost} onClick={() => setMonth("")} disabled={!month}>
          Todos los meses
        </button>
      </div>

      {error && <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table className="mg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted, fontSize: 11, textTransform: "uppercase" }}>
              <th style={th}>Fecha</th>
              <th style={th}>Cliente</th>
              <th style={th}>Período</th>
              <th style={th}>Medio</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: "right" }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {loading && payments.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  No hay movimientos con estos filtros.
                </td>
              </tr>
            )}
            {payments.map((payment) => {
              const badge = STATUS_LABELS[payment.status] ?? { label: payment.status, color: COLORS.muted };
              return (
                <tr key={payment.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td style={td} data-label="Fecha">
                    {dateTime(payment.createdAt)}
                  </td>
                  <td style={td} data-label="Cliente">
                    <div>
                      <div style={{ fontWeight: 600 }}>{payment.clientName}</div>
                      {payment.note && <div style={{ color: COLORS.muted, fontSize: 12 }}>{payment.note}</div>}
                    </div>
                  </td>
                  <td style={td} data-label="Período">
                    {payment.period ?? "-"}
                  </td>
                  <td style={td} data-label="Medio">
                    {payment.provider === "manual"
                      ? `${payment.method ?? "Manual"} (manual)`
                      : `GalioPay${payment.method ? ` · ${payment.method}` : ""}`}
                  </td>
                  <td style={td} data-label="Estado">
                    <span style={{ color: badge.color, fontWeight: 700 }}>● {badge.label}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }} data-label="Monto">
                    <div>
                      {money(payment.amount, payment.currency)}
                      {payment.netAmount !== null && payment.netAmount !== payment.amount && (
                        <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 400 }}>
                          neto {money(payment.netAmount, payment.currency)}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
