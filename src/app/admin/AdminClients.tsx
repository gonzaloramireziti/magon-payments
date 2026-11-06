"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import {
  COLORS,
  Field,
  Section,
  button,
  fetchJson,
  ghost,
  input,
  money,
  panel,
  shortDate,
  stateBadge,
  td,
  th,
  whatsappReminderUrl,
} from "./ui";

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
  phone: string | null;
  monthly_amount: number | string;
  currency: string;
  active: boolean;
  notes: string | null;
  start_period: string | null;
  support_policy?: Record<string, string[]> | null;
  created_at: string;
  status: Status | null;
};

export function AdminClients({
  onChanged,
  onMessage,
  onError,
}: {
  onChanged: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ clients: AdminClient[] }>("/api/admin/clients?withStatus=1");
      setClients(data.clients);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  function changed(message: string) {
    onMessage(message);
    setEditingId(null);
    setPayingId(null);
    setShowNew(false);
    onChanged();
    void load();
  }

  async function remove(client: AdminClient) {
    const confirmed = window.confirm(
      `¿Borrar a "${client.name}"? Se eliminan también sus facturas, pagos y tickets asociados.`
    );
    if (!confirmed) return;
    try {
      await fetchJson(`/api/admin/clients?id=${encodeURIComponent(client.id)}`, { method: "DELETE" });
      changed(`Cliente "${client.name}" eliminado`);
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <Section
      title="Clientes"
      subtitle={`${clients.length} cliente(s) · ${clients.filter((client) => client.active).length} activo(s)`}
      actions={
        <button style={button} onClick={() => setShowNew((value) => !value)}>
          {showNew ? "Cerrar" : "+ Nuevo cliente"}
        </button>
      }
    >
      {showNew && <NewClientForm onCreated={changed} onError={onError} />}

      <div style={{ ...panel, overflowX: "auto" }}>
        <table className="mg-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
            {loading && clients.length === 0 && (
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
                    <td style={td} data-label="Cliente">
                      <div>
                        <div style={{ fontWeight: 600 }}>{client.name}</div>
                        <div style={{ color: COLORS.muted, fontSize: 12 }}>{client.email ?? "-"}</div>
                      </div>
                    </td>
                    <td style={td} data-label="KEY">
                      <code style={{ fontSize: 11, wordBreak: "break-all" }}>{client.client_key}</code>
                    </td>
                    <td style={td} data-label="Monto">
                      {money(Number(client.monthly_amount), client.currency)}
                    </td>
                    <td style={td} data-label="Período">
                      {status?.periodLabel ?? "-"}
                    </td>
                    <td style={td} data-label="Vence">
                      {status ? shortDate(status.dueDate) : "-"}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 700,
                        color: (status?.amountDue ?? 0) > 0 ? COLORS.danger : COLORS.ok,
                      }}
                      data-label="Deuda"
                    >
                      {money(status?.amountDue ?? 0, client.currency)}
                    </td>
                    <td style={td} data-label="Estado">
                      <span style={{ color: badge.color, fontWeight: 700 }}>● {badge.label}</span>
                    </td>
                    <td className="mg-actions" style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
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
                      </button>{" "}
                      <a
                        href={whatsappReminderUrl(
                          client.name,
                          client.phone,
                          status?.amountDue ?? 0,
                          client.currency,
                          status?.periodLabel ?? ""
                        )}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          ...ghost,
                          marginLeft: 6,
                          display: "inline-block",
                          textDecoration: "none",
                          color: COLORS.ok,
                          borderColor: `${COLORS.ok}66`,
                        }}
                      >
                        WhatsApp
                      </a>{" "}
                      <button
                        style={{
                          ...ghost,
                          marginLeft: 6,
                          color: COLORS.danger,
                          borderColor: `${COLORS.danger}66`,
                        }}
                        onClick={() => remove(client)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>

                  {editingId === client.id && (
                    <tr className="mg-detail">
                      <td colSpan={8} style={{ background: "#0e0e12", padding: 16 }}>
                        <EditClientForm client={client} onSaved={changed} onError={onError} />
                      </td>
                    </tr>
                  )}

                  {payingId === client.id && (
                    <tr className="mg-detail">
                      <td colSpan={8} style={{ background: "#0e0e12", padding: 16 }}>
                        <ManualPaymentForm client={client} onPaid={changed} onError={onError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  alignItems: "end",
} as const;

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
    phone: "",
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
      const data = await fetchJson<{ client: { client_key: string } }>("/api/admin/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          monthlyAmount: Number(form.monthlyAmount),
          currency: form.currency,
          startPeriod: form.startPeriod || null,
          clientKey: form.clientKey || undefined,
        }),
      });
      onCreated(`Cliente creado. KEY: ${data.client.client_key}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...panel, ...formGrid, padding: 18, marginBottom: 18 }}>
      <Field label="Nombre">
        <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Email">
        <input style={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="WhatsApp">
        <input style={input} placeholder="5491122334455" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Monto mensual">
        <input style={input} type="number" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
      </Field>
      <Field label="Moneda">
        <select style={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
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

// Presets de lo que puede reportar cada cliente desde <MagonSupport>.
const POLICY_PRESETS: Array<{ id: string; label: string; policy: Record<string, string[]> }> = [
  { id: "all", label: "Problemas y funcionalidades", policy: { default: ["bug", "feature"] } },
  { id: "bugs", label: "Solo problemas", policy: { default: ["bug"] } },
  {
    id: "bugs-admin",
    label: "Solo problemas (el canal admin también funcionalidades)",
    policy: { default: ["bug"], admin: ["bug", "feature"] },
  },
  { id: "none", label: "No puede reportar", policy: { default: [] } },
];

function samePolicy(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const normalize = (policy: Record<string, string[]>) =>
    JSON.stringify(
      Object.keys(policy)
        .sort()
        .map((key) => [key, [...policy[key]].sort()])
    );
  return normalize(a) === normalize(b);
}

function presetFor(policy: Record<string, string[]>): string {
  return POLICY_PRESETS.find((preset) => samePolicy(preset.policy, policy))?.id ?? "custom";
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
  const initialPolicy = client.support_policy ?? POLICY_PRESETS[0].policy;
  const [form, setForm] = useState({
    name: client.name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    monthlyAmount: String(client.monthly_amount),
    currency: client.currency,
    startPeriod: client.start_period ?? "",
    active: client.active,
  });
  const [preset, setPreset] = useState(presetFor(initialPolicy));
  const [customPolicy, setCustomPolicy] = useState(JSON.stringify(initialPolicy));
  const [saving, setSaving] = useState(false);

  function selectedPolicy(): Record<string, string[]> {
    if (preset !== "custom") {
      return POLICY_PRESETS.find((item) => item.id === preset)?.policy ?? POLICY_PRESETS[0].policy;
    }
    const parsed = JSON.parse(customPolicy) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON inválido");
    return parsed as Record<string, string[]>;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      let policy: Record<string, string[]>;
      try {
        policy = selectedPolicy();
      } catch {
        throw new Error('La política de reportes no es un JSON válido. Ej: {"default": ["bug"]}');
      }
      await fetchJson("/api/admin/clients", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: client.id,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          monthlyAmount: Number(form.monthlyAmount),
          currency: form.currency,
          startPeriod: form.startPeriod || null,
          active: form.active,
          // Solo se manda si cambió, para no fallar si la migración de tickets no se corrió.
          ...(samePolicy(policy, initialPolicy) ? {} : { supportPolicy: policy }),
        }),
      });
      onSaved("Cliente actualizado");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} style={formGrid}>
      <Field label="Nombre">
        <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Email">
        <input style={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="WhatsApp">
        <input style={input} placeholder="5491122334455" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Monto mensual">
        <input style={input} type="number" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
      </Field>
      <Field label="Moneda">
        <select style={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
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
      <Field label="Qué puede reportar">
        <select style={input} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {POLICY_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">Personalizado (JSON)</option>
        </select>
      </Field>
      {preset === "custom" && (
        <Field label="Política por canal">
          <input
            style={{ ...input, fontFamily: "ui-monospace, monospace" }}
            value={customPolicy}
            onChange={(e) => setCustomPolicy(e.target.value)}
          />
        </Field>
      )}
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
      const data = await fetchJson<{ amount: number }>("/api/admin/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: client.id, invoiceIds: selected, method, note }),
      });
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
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Confirmar pago manual · {client.name}</div>
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
              {invoice.period} · vence {shortDate(invoice.dueDate)} · {money(invoice.amount, invoice.currency)}
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
          <input style={{ ...input, width: 260, maxWidth: "100%" }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ color: COLORS.muted, fontSize: 12 }}>Total seleccionado</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{money(total, client.currency)}</div>
          <button style={button} onClick={confirm} disabled={saving || selected.length === 0}>
            {saving ? "Registrando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
