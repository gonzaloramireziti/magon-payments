"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

type Invoice = {
  id: string;
  period: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: string;
};

type Status = {
  found: boolean;
  blocked: boolean;
  state: string;
  amountDue: number;
  currency: string;
  periodLabel: string;
  dueDate: string;
  daysUntilDue: number;
  invoices: Invoice[];
};

type AdminClient = {
  id: string;
  client_key: string;
  name: string;
  email: string | null;
  monthly_amount: number | string;
  currency: string;
  active: boolean;
  notes: string | null;
  start_period: string | null;
  created_at: string;
  status: Status | null;
};

const COLORS = {
  bg: "#08080b",
  surface: "#121216",
  border: "#27272a",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  danger: "#f87171",
  ok: "#4ade80",
  warn: "#facc15",
};

const input: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: 13,
  boxSizing: "border-box",
};

const button: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 9,
  border: "none",
  background: "#ffffff",
  color: "#0a0a0a",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const ghost: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 9,
  border: `1px solid ${COLORS.border}`,
  background: "transparent",
  color: COLORS.text,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function shortDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function stateBadge(state: string): { label: string; color: string } {
  switch (state) {
    case "active":
      return { label: "Al día", color: COLORS.ok };
    case "due":
      return { label: "Por vencer", color: COLORS.warn };
    case "blocked":
      return { label: "Vencido", color: COLORS.danger };
    case "inactive":
      return { label: "Inactivo", color: COLORS.muted };
    default:
      return { label: "Sin datos", color: COLORS.muted };
  }
}

export function AdminDashboard() {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/clients?withStatus=1", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setClients(data.clients as AdminClient[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  const totalDebt = clients.reduce((acc, client) => acc + (client.status?.amountDue ?? 0), 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        padding: "28px 24px 60px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Administración Magon</h1>
            <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: 13 }}>
              {clients.length} clientes · deuda total {money(totalDebt, "ARS")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={button} onClick={() => setShowNew((value) => !value)}>
              {showNew ? "Cerrar" : "+ Nuevo cliente"}
            </button>
            <button style={ghost} onClick={logout}>
              Salir
            </button>
          </div>
        </header>

        {message && (
          <div style={{ ...banner, color: COLORS.ok, borderColor: `${COLORS.ok}55` }}>{message}</div>
        )}
        {error && (
          <div style={{ ...banner, color: COLORS.danger, borderColor: `${COLORS.danger}55` }}>
            {error}
          </div>
        )}

        {showNew && (
          <NewClientForm
            onCreated={(text) => {
              setMessage(text);
              setShowNew(false);
              void load();
            }}
            onError={setError}
          />
        )}

        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.muted, fontSize: 11, textTransform: "uppercase" }}>
                <th style={th}>Cliente</th>
                <th style={th}>KEY</th>
                <th style={th}>Monto</th>
                <th style={th}>Período</th>
                <th style={th}>Vence</th>
                <th style={th}>Deuda</th>
                <th style={th}>Estado</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td style={td} colSpan={8}>
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && clients.length === 0 && (
                <tr>
                  <td style={td} colSpan={8}>
                    No hay clientes todavía.
                  </td>
                </tr>
              )}
              {clients.map((client) => {
                const status = client.status;
                const badge = stateBadge(status?.state ?? "not_found");
                return (
                  <Fragment key={client.id}>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{client.name}</div>
                        <div style={{ color: COLORS.muted, fontSize: 12 }}>{client.email ?? "-"}</div>
                      </td>
                      <td style={td}>
                        <code style={{ fontSize: 11 }}>{client.client_key}</code>
                      </td>
                      <td style={td}>{money(Number(client.monthly_amount), client.currency)}</td>
                      <td style={td}>{status?.periodLabel ?? "-"}</td>
                      <td style={td}>{status ? shortDate(status.dueDate) : "-"}</td>
                      <td style={{ ...td, fontWeight: 700, color: (status?.amountDue ?? 0) > 0 ? COLORS.danger : COLORS.ok }}>
                        {money(status?.amountDue ?? 0, client.currency)}
                      </td>
                      <td style={td}>
                        <span style={{ color: badge.color, fontWeight: 700 }}>● {badge.label}</span>
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          style={ghost}
                          onClick={() => {
                            setEditingId(editingId === client.id ? null : client.id);
                            setPayingId(null);
                          }}
                        >
                          Editar
                        </button>{" "}
                        <button
                          style={{ ...ghost, marginLeft: 6 }}
                          onClick={() => {
                            setPayingId(payingId === client.id ? null : client.id);
                            setEditingId(null);
                          }}
                        >
                          Confirmar pago
                        </button>
                      </td>
                    </tr>

                    {editingId === client.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "#0e0e12", padding: 16 }}>
                          <EditClientForm
                            client={client}
                            onSaved={(text) => {
                              setMessage(text);
                              setEditingId(null);
                              void load();
                            }}
                            onError={setError}
                          />
                        </td>
                      </tr>
                    )}

                    {payingId === client.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "#0e0e12", padding: 16 }}>
                          <ManualPaymentForm
                            client={client}
                            onPaid={(text) => {
                              setMessage(text);
                              setPayingId(null);
                              void load();
                            }}
                            onError={setError}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

const banner: CSSProperties = {
  border: "1px solid",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  marginBottom: 14,
};

const th: CSSProperties = { padding: "12px 14px", fontWeight: 700 };
const td: CSSProperties = { padding: "12px 14px", verticalAlign: "middle" };

function NewClientForm({
  onCreated,
  onError,
}: {
  onCreated: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    monthlyAmount: "15000",
    currency: "ARS",
    startPeriod: "",
    clientKey: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          monthlyAmount: Number(form.monthlyAmount),
          currency: form.currency,
          startPeriod: form.startPeriod || null,
          clientKey: form.clientKey || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      onCreated(`Cliente creado. KEY: ${data.client.client_key}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 18,
        marginBottom: 18,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        alignItems: "end",
      }}
    >
      <Field label="Nombre">
        <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Email">
        <input style={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Monto mensual">
        <input style={input} type="number" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
      </Field>
      <Field label="Moneda">
        <input style={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
      </Field>
      <Field label="Primer período (YYYY-MM)">
        <input style={input} placeholder="2026-09" value={form.startPeriod} onChange={(e) => setForm({ ...form, startPeriod: e.target.value })} />
      </Field>
      <Field label="KEY (opcional)">
        <input style={input} value={form.clientKey} onChange={(e) => setForm({ ...form, clientKey: e.target.value })} />
      </Field>
      <button style={button} type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Crear cliente"}
      </button>
    </form>
  );
}

function EditClientForm({
  client,
  onSaved,
  onError,
}: {
  client: AdminClient;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    name: client.name,
    email: client.email ?? "",
    monthlyAmount: String(client.monthly_amount),
    currency: client.currency,
    startPeriod: client.start_period ?? "",
    active: client.active,
  });
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/clients", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: client.id,
          name: form.name,
          email: form.email || null,
          monthlyAmount: Number(form.monthlyAmount),
          currency: form.currency,
          startPeriod: form.startPeriod || null,
          active: form.active,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      onSaved("Cliente actualizado");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        alignItems: "end",
      }}
    >
      <Field label="Nombre">
        <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Email">
        <input style={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Monto mensual">
        <input style={input} type="number" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
      </Field>
      <Field label="Moneda">
        <input style={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
      </Field>
      <Field label="Primer período (YYYY-MM)">
        <input style={input} value={form.startPeriod} onChange={(e) => setForm({ ...form, startPeriod: e.target.value })} />
      </Field>
      <Field label="Activo">
        <select
          style={input}
          value={form.active ? "1" : "0"}
          onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
        >
          <option value="1">Sí</option>
          <option value="0">No</option>
        </select>
      </Field>
      <button style={button} type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

function ManualPaymentForm({
  client,
  onPaid,
  onError,
}: {
  client: AdminClient;
  onPaid: (message: string) => void;
  onError: (message: string) => void;
}) {
  const unpaid = (client.status?.invoices ?? []).filter(
    (invoice) => invoice.status === "pending" || invoice.status === "overdue"
  );
  const [selected, setSelected] = useState<string[]>(unpaid.map((invoice) => invoice.id));
  const [method, setMethod] = useState("Transferencia bancaria");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const total = unpaid
    .filter((invoice) => selected.includes(invoice.id))
    .reduce((acc, invoice) => acc + invoice.amount, 0);

  async function confirm() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: client.id, invoiceIds: selected, method, note }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      onPaid(`Pago confirmado: ${money(data.amount, client.currency)}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (unpaid.length === 0) {
    return (
      <div style={{ color: COLORS.muted, fontSize: 13 }}>
        No hay facturas pendientes para {client.name}.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        Confirmar pago manual · {client.name}
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {unpaid.map((invoice) => (
          <label key={invoice.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selected.includes(invoice.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, invoice.id]
                    : current.filter((id) => id !== invoice.id)
                )
              }
            />
            <span>
              {invoice.period} · vence {shortDate(invoice.dueDate)} ·{" "}
              {money(invoice.amount, invoice.currency)}
              {invoice.status === "overdue" ? " (vencida)" : ""}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <Field label="Medio de pago">
          <select style={{ ...input, width: 200 }} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Transferencia bancaria</option>
            <option>Efectivo</option>
            <option>Mercado Pago</option>
            <option>Otro</option>
          </select>
        </Field>
        <Field label="Nota (opcional)">
          <input style={{ ...input, width: 260 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ color: COLORS.muted, fontSize: 12 }}>Total seleccionado</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            {money(total, client.currency)}
          </div>
          <button style={button} onClick={confirm} disabled={saving || selected.length === 0}>
            {saving ? "Registrando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}
