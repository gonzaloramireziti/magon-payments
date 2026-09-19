"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { COLORS, Field, button, ghost, input, money } from "./ui";

type Cost = {
  id: string;
  name: string;
  amount: number | string;
  currency: string;
  active: boolean;
  notes: string | null;
};

export function AdminCosts({ onChanged }: { onChanged: () => void }) {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", currency: "ARS" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/costs", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      setCosts(data.costs as Cost[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/costs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          amount: Number(form.amount),
          currency: form.currency,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      setForm({ name: "", amount: "", currency: "ARS" });
      await load();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(cost: Cost) {
    if (!window.confirm(`¿Borrar el costo "${cost.name}"?`)) return;
    try {
      const response = await fetch(`/api/admin/costs?id=${encodeURIComponent(cost.id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      await load();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const totalArs = costs
    .filter((cost) => cost.active && cost.currency === "ARS")
    .reduce((acc, cost) => acc + Number(cost.amount), 0);
  const totalUsd = costs
    .filter((cost) => cost.active && cost.currency === "USD")
    .reduce((acc, cost) => acc + Number(cost.amount), 0);

  return (
    <section style={{ marginBottom: 26 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: "14px 16px",
          color: COLORS.text,
          cursor: "pointer",
          textAlign: "left",
          marginBottom: open ? 14 : 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: COLORS.muted, fontSize: 11, width: 12 }}>{open ? "▼" : "▶"}</span>
          Costos fijos mensuales
        </span>
        <span style={{ fontSize: 12, color: COLORS.muted }}>
          {costs.length} · {money(totalArs, "ARS")} + {money(totalUsd, "USD")}
        </span>
      </button>

      {open && (
        <>
      <form
        onSubmit={create}
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr auto",
          gap: 12,
          alignItems: "end",
          marginBottom: 14,
        }}
      >
        <Field label="Nombre">
          <input
            style={input}
            placeholder="Hosting, dominio, etc."
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Monto">
          <input
            style={input}
            type="number"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </Field>
        <Field label="Moneda">
          <select
            style={input}
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <button style={button} type="submit" disabled={saving}>
          {saving ? "..." : "Agregar"}
        </button>
      </form>

      {error && <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
        {loading && <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>Cargando...</div>}
        {!loading && costs.length === 0 && (
          <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>No hay costos cargados.</div>
        )}
        {costs.map((cost) => (
          <div
            key={cost.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            {editingId === cost.id ? (
              <EditCostRow
                cost={cost}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                  onChanged();
                }}
                onError={setError}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {cost.name} {cost.active ? "" : "(inactivo)"}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    {money(Number(cost.amount), cost.currency)} / mes
                  </div>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>
                  <button style={ghost} onClick={() => setEditingId(cost.id)}>
                    Editar
                  </button>{" "}
                  <button
                    style={{ ...ghost, marginLeft: 6, color: COLORS.danger, borderColor: `${COLORS.danger}66` }}
                    onClick={() => remove(cost)}
                  >
                    Borrar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
        </>
      )}
    </section>
  );
}

function EditCostRow({
  cost,
  onSaved,
  onError,
  onCancel,
}: {
  cost: Cost;
  onSaved: () => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(cost.name);
  const [amount, setAmount] = useState(String(cost.amount));
  const [currency, setCurrency] = useState(cost.currency);
  const [active, setActive] = useState(cost.active);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/costs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: cost.id, name, amount: Number(amount), currency, active }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Error");
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
      <input style={{ ...input, flex: 2, minWidth: 140 }} value={name} onChange={(e) => setName(e.target.value)} />
      <input style={{ ...input, width: 110 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <select style={{ ...input, width: 90 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
        <option value="ARS">ARS</option>
        <option value="USD">USD</option>
      </select>
      <select style={{ ...input, width: 110 }} value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
        <option value="1">Activo</option>
        <option value="0">Inactivo</option>
      </select>
      <div style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
        <button style={button} onClick={save} disabled={saving}>
          {saving ? "..." : "Guardar"}
        </button>{" "}
        <button style={{ ...ghost, marginLeft: 6 }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
