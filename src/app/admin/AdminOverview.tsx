"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminStats } from "./AdminStats";
import {
  COLORS,
  Card,
  Section,
  fetchJson,
  ghost,
  money,
  panel,
  shortDate,
  stateBadge,
  whatsappReminderUrl,
} from "./ui";

type Amounts = { ARS: number; USD: number };
type Totals = { totalArs: number; totalUsd: number };

type CollectionRow = {
  clientId: string;
  name: string;
  phone: string | null;
  currency: string;
  state: string;
  amountDue: number;
  unpaidCount: number;
  oldestDueDate: string | null;
  daysOverdue: number | null;
  periodPaid: boolean;
};

type Overview = {
  today: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  daysUntilDue: number;
  rate: { usd: number; source: string; available: boolean };
  summary: {
    billed: Amounts;
    paid: Amounts;
    pending: Amounts;
    overdue: Amounts;
    invoices: number;
    paidInvoices: number;
    totals: { billed: Totals; paid: Totals; pending: Totals; overdue: Totals };
  };
  collected: { amounts: Amounts; count: number; totals: Totals };
  collection: CollectionRow[];
  tickets: { new: number; open: number; bugs: number; features: number } | null;
};

// Monto en las dos monedas, solo las que tienen valor ("$ 1.000 + US$ 50").
function both(amounts: Amounts): string {
  const parts = [];
  if (amounts.ARS) parts.push(money(amounts.ARS, "ARS"));
  if (amounts.USD) parts.push(money(amounts.USD, "USD"));
  return parts.length ? parts.join(" + ") : money(0, "ARS");
}

function dueText(row: CollectionRow, periodLabel: string): string {
  if (row.state === "active") return `${periodLabel} pagado`;
  if (row.daysOverdue === null) return "-";
  if (row.daysOverdue > 0) {
    return `${row.daysOverdue} día(s) de atraso · ${row.unpaidCount} factura(s)`;
  }
  if (row.daysOverdue === 0) return "Vence hoy";
  return `Vence en ${-row.daysOverdue} día(s)`;
}

export function AdminOverview({
  reloadKey,
  onOpenBoard,
}: {
  reloadKey: number;
  onOpenBoard: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<{ overview: Overview }>("/api/admin/overview");
      setData(json.overview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const summary = data?.summary;
  const progress =
    summary && summary.totals.billed.totalArs > 0
      ? Math.min(100, Math.round((summary.totals.paid.totalArs / summary.totals.billed.totalArs) * 100))
      : 0;
  const pendingRows = data?.collection.filter((row) => row.state !== "active") ?? [];
  const paidRows = data?.collection.filter((row) => row.state === "active") ?? [];

  return (
    <>
      <Section
        title={data ? `Cobranza de ${data.periodLabel}` : "Cobranza del período"}
        subtitle={
          data
            ? `Vence el ${shortDate(data.dueDate)} · ${
                data.daysUntilDue > 0
                  ? `faltan ${data.daysUntilDue} día(s)`
                  : data.daysUntilDue === 0
                    ? "vence hoy"
                    : `venció hace ${-data.daysUntilDue} día(s)`
              }`
            : undefined
        }
        actions={
          <button style={ghost} onClick={() => void load()} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        }
      >
        {error && <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {loading && !data && <div style={{ color: COLORS.muted, fontSize: 13 }}>Calculando...</div>}

        {data && summary && (
          <>
            <div style={{ ...panel, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                <span>
                  <strong>{summary.paidInvoices}</strong> de <strong>{summary.invoices}</strong> clientes pagaron
                </span>
                <span style={{ color: COLORS.muted }}>{progress}% cobrado</span>
              </div>
              <div
                style={{ height: 8, background: COLORS.bg, borderRadius: 99, marginTop: 10, overflow: "hidden" }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div style={{ width: `${progress}%`, height: "100%", background: COLORS.ok, borderRadius: 99 }} />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              <Card title="Facturado del período" value={both(summary.billed)} hint={`${summary.invoices} factura(s)`} />
              <Card title="Cobrado del período" value={both(summary.paid)} color={COLORS.ok} />
              <Card title="Falta cobrar" value={both(summary.pending)} color={COLORS.warn} />
              <Card
                title="Vencido"
                value={both(summary.overdue)}
                color={summary.totals.overdue.totalArs > 0 ? COLORS.danger : COLORS.text}
                hint="Facturas impagas con el vencimiento pasado"
              />
              <Card
                title="Entró este mes"
                value={both(data.collected.amounts)}
                hint={`${data.collected.count} pago(s) acreditado(s), de cualquier período`}
              />
            </div>
            {data.rate.available && (
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 10 }}>
                {`Total del período en pesos: ${money(summary.totals.billed.totalArs, "ARS")} · dólar oficial $${data.rate.usd.toFixed(2)}`}
              </div>
            )}
          </>
        )}
      </Section>

      {data && (
        <div className="mg-two-cols">
          <Section
            title="A quién cobrarle"
            subtitle={pendingRows.length ? `${pendingRows.length} cliente(s) con saldo` : "Todos al día"}
            actions={
              paidRows.length > 0 ? (
                <button style={ghost} onClick={() => setShowPaid((value) => !value)}>
                  {showPaid ? "Ocultar al día" : `Ver al día (${paidRows.length})`}
                </button>
              ) : undefined
            }
          >
            <div style={{ ...panel, overflow: "hidden" }}>
              {[...pendingRows, ...(showPaid ? paidRows : [])].map((row) => {
                const badge = stateBadge(row.state);
                return (
                  <div
                    key={row.clientId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderTop: `1px solid ${COLORS.border}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: badge.color, fontSize: 12 }} title={badge.label}>
                      ●
                    </span>
                    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ color: row.state === "blocked" ? COLORS.danger : COLORS.muted, fontSize: 12 }}>
                        {dueText(row, data.periodLabel)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: row.amountDue > 0 ? COLORS.text : COLORS.ok }}>
                      {money(row.amountDue, row.currency)}
                    </div>
                    {row.amountDue > 0 && (
                      <a
                        href={whatsappReminderUrl(row.name, row.phone, row.amountDue, row.currency, data.periodLabel)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          ...ghost,
                          textDecoration: "none",
                          color: row.phone ? COLORS.ok : COLORS.muted,
                          borderColor: row.phone ? `${COLORS.ok}66` : COLORS.border,
                        }}
                        title={row.phone ? "Enviar recordatorio" : "El cliente no tiene WhatsApp cargado"}
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                );
              })}
              {pendingRows.length === 0 && !showPaid && (
                <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>
                  No hay saldos pendientes en este momento.
                </div>
              )}
            </div>
          </Section>

          <Section title="Tickets">
            {data.tickets ? (
              <button
                type="button"
                onClick={onOpenBoard}
                style={{ ...panel, width: "100%", padding: 16, textAlign: "left", color: COLORS.text, cursor: "pointer" }}
              >
                <div style={{ fontSize: 28, fontWeight: 800, color: data.tickets.new ? COLORS.warn : COLORS.text }}>
                  {data.tickets.new}
                </div>
                <div style={{ fontSize: 13, marginBottom: 10 }}>nuevo(s) sin revisar</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  {data.tickets.open} abierto(s) · {data.tickets.bugs} problema(s) · {data.tickets.features} funcionalidad(es)
                </div>
                <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 10 }}>Abrir tablero →</div>
              </button>
            ) : (
              <div style={{ ...panel, padding: 16, color: COLORS.muted, fontSize: 13 }}>
                La ticketera todavía no está habilitada: falta correr la migración
                <code> 003_tickets.sql</code> en Supabase.
              </div>
            )}
          </Section>
        </div>
      )}

      <AdminStats reloadKey={reloadKey} />
    </>
  );
}
