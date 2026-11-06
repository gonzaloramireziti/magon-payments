"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { COLORS, Field, Section, button, fetchJson, ghost, input, panel, shortDate } from "./ui";

type Status = "new" | "analysis" | "ready" | "in_progress" | "testing" | "done" | "discarded";
type Urgency = "low" | "medium" | "high" | "critical";

type Ticket = {
  id: string;
  number: number;
  client_id: string;
  client_name: string;
  channel: string;
  type: "bug" | "feature";
  title: string;
  description: string;
  expected: string | null;
  actual: string | null;
  urgency: Urgency;
  status: Status;
  position: number;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_ref: string | null;
  page_url: string | null;
  user_agent: string | null;
  app_version: string | null;
  internal_notes: string | null;
  attachment_urls: Array<{ path: string; name: string; url: string | null }>;
  created_at: string;
  resolved_at: string | null;
};

const COLUMNS: Array<{ status: Status; label: string; hint: string }> = [
  { status: "new", label: "Nuevo", hint: "Recién cargado por el cliente" },
  { status: "analysis", label: "En análisis", hint: "Entendiendo qué pasa o qué piden" },
  { status: "ready", label: "Listo para hacer", hint: "Claro y priorizado" },
  { status: "in_progress", label: "En desarrollo", hint: "Alguien lo está haciendo" },
  { status: "testing", label: "Para probar", hint: "Esperando la prueba de Matías" },
  { status: "done", label: "Resuelto", hint: "Publicado" },
];

const DISCARDED_COLUMN = { status: "discarded" as Status, label: "Descartado", hint: "No se va a hacer" };

const URGENCY: Record<Urgency, { label: string; color: string }> = {
  low: { label: "Baja", color: COLORS.muted },
  medium: { label: "Media", color: "#60a5fa" },
  high: { label: "Alta", color: COLORS.warn },
  critical: { label: "Crítica", color: COLORS.danger },
};

const TYPE_LABEL = {
  bug: { label: "Problema", color: COLORS.danger },
  feature: { label: "Funcionalidad", color: COLORS.accent },
};

function age(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

// Posición entre dos vecinos; si se suelta al final de la columna, una más que el último.
function positionBetween(before: Ticket | undefined, after: Ticket | undefined): number {
  if (before && after) return (before.position + after.position) / 2;
  if (after) return after.position - 1;
  if (before) return before.position + 1;
  return 0;
}

export function AdminBoard({ onError }: { onError: (message: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ tickets: Ticket[] }>(
        `/api/admin/tickets${showDiscarded ? "?discarded=1" : ""}`
      );
      setTickets(data.tickets);
      setUnavailable(false);
    } catch (err) {
      // Sin la migración la tabla no existe: se muestra el aviso en vez del tablero.
      if ((err as { code?: string }).code === "TICKETS_UNAVAILABLE") setUnavailable(true);
      else onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showDiscarded, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const ticket of tickets) map.set(ticket.client_id, ticket.client_name);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const visible = tickets.filter(
    (ticket) =>
      (!clientFilter || ticket.client_id === clientFilter) && (!typeFilter || ticket.type === typeFilter)
  );

  const columns = showDiscarded ? [...COLUMNS, DISCARDED_COLUMN] : COLUMNS;

  function columnTickets(status: Status): Ticket[] {
    return visible.filter((ticket) => ticket.status === status).sort((a, b) => a.position - b.position);
  }

  async function patch(id: string, changes: Partial<Pick<Ticket, "status" | "urgency" | "position" | "internal_notes">>) {
    const previous = tickets;
    setTickets((current) => current.map((ticket) => (ticket.id === id ? { ...ticket, ...changes } : ticket)));
    try {
      await fetchJson("/api/admin/tickets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          status: changes.status,
          urgency: changes.urgency,
          position: changes.position,
          ...(changes.internal_notes !== undefined ? { internalNotes: changes.internal_notes } : {}),
        }),
      });
    } catch (err) {
      setTickets(previous);
      onError((err as Error).message);
    }
  }

  function drop(event: DragEvent, status: Status, beforeId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setOverColumn(null);
    const id = dragId ?? event.dataTransfer.getData("text/plain");
    setDragId(null);
    if (!id || id === beforeId) return;
    const target = columnTickets(status).filter((ticket) => ticket.id !== id);
    const index = beforeId ? target.findIndex((ticket) => ticket.id === beforeId) : target.length;
    const position = positionBetween(target[index - 1], target[index]);
    void patch(id, { status, position });
  }

  const opened = tickets.find((ticket) => ticket.id === openId) ?? null;

  if (unavailable && !loading) {
    return (
      <Section title="Tablero">
        <div style={{ ...panel, padding: 16, color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
          La ticketera todavía no está habilitada. Hay que correr
          <code> supabase/migrations/003_tickets.sql</code> en el SQL Editor de Supabase y después
          actualizar esta pantalla.
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Tablero"
      subtitle={`${visible.filter((ticket) => ticket.status !== "done" && ticket.status !== "discarded").length} ticket(s) abierto(s) · arrastrá las tarjetas para cambiarlas de columna`}
      actions={
        <>
          <select style={{ ...input, width: 180 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select style={{ ...input, width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="bug">Problemas</option>
            <option value="feature">Funcionalidades</option>
          </select>
          <button style={ghost} onClick={() => setShowDiscarded((value) => !value)}>
            {showDiscarded ? "Ocultar descartados" : "Ver descartados"}
          </button>
          <button style={ghost} onClick={() => void load()} disabled={loading}>
            {loading ? "..." : "Actualizar"}
          </button>
        </>
      }
    >
      <div className="mg-board">
        {columns.map((column) => {
          const items = columnTickets(column.status);
          return (
            <div
              key={column.status}
              onDragOver={(event) => {
                event.preventDefault();
                setOverColumn(column.status);
              }}
              onDragLeave={() => setOverColumn((current) => (current === column.status ? null : current))}
              onDrop={(event) => drop(event, column.status, null)}
              style={{
                ...panel,
                padding: 10,
                minHeight: 160,
                background: overColumn === column.status ? "#17171d" : COLORS.surface,
                borderColor: overColumn === column.status ? COLORS.accent : COLORS.border,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 4px 10px" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }} title={column.hint}>
                  {column.label}
                </span>
                <span style={{ color: COLORS.muted, fontSize: 12 }}>{items.length}</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {items.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    dragging={dragId === ticket.id}
                    onDragStart={(event) => {
                      setDragId(ticket.id);
                      event.dataTransfer.setData("text/plain", ticket.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverColumn(null);
                    }}
                    onDrop={(event) => drop(event, column.status, ticket.id)}
                    onOpen={() => setOpenId(ticket.id)}
                  />
                ))}
                {items.length === 0 && (
                  <div style={{ color: COLORS.muted, fontSize: 12, padding: "8px 4px" }}>Sin tickets</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {opened && (
        <TicketDetail
          key={opened.id}
          ticket={opened}
          onClose={() => setOpenId(null)}
          onChange={(changes) => patch(opened.id, changes)}
        />
      )}
    </Section>
  );
}

function TicketCard({
  ticket,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onOpen,
}: {
  ticket: Ticket;
  dragging: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent) => void;
  onOpen: () => void;
}) {
  const type = TYPE_LABEL[ticket.type];
  const urgency = URGENCY[ticket.urgency] ?? URGENCY.medium;
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onOpen}
      style={{
        textAlign: "left",
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${urgency.color}`,
        borderRadius: 10,
        padding: "10px 11px",
        color: COLORS.text,
        cursor: "grab",
        opacity: dragging ? 0.4 : 1,
        width: "100%",
        font: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: type.color, fontWeight: 700 }}>{type.label}</span>
        <span style={{ color: COLORS.muted }}>#{ticket.number}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 8, wordBreak: "break-word" }}>
        {ticket.title}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: COLORS.muted }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ticket.client_name}
          {ticket.channel !== "default" ? ` · ${ticket.channel}` : ""}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>{age(ticket.created_at)}</span>
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function TicketDetail({
  ticket,
  onClose,
  onChange,
}: {
  ticket: Ticket;
  onClose: () => void;
  onChange: (changes: Partial<Pick<Ticket, "status" | "urgency" | "internal_notes">>) => Promise<void>;
}) {
  const [notes, setNotes] = useState(ticket.internal_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const type = TYPE_LABEL[ticket.type];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reporter = [ticket.reporter_name, ticket.reporter_email, ticket.reporter_ref].filter(Boolean).join(" · ");
  const context = [
    ticket.page_url,
    ticket.app_version ? `Versión ${ticket.app_version}` : null,
    ticket.user_agent,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ticket #${ticket.number}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          overflowY: "auto",
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          padding: 22,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: type.color, fontWeight: 700 }}>{type.label}</span>
            <span style={{ color: COLORS.muted }}>
              {" "}
              · #{ticket.number} · {ticket.client_name}
              {ticket.channel !== "default" ? ` (${ticket.channel})` : ""}
            </span>
          </div>
          <button style={ghost} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <h3 style={{ margin: "0 0 6px", fontSize: 19, lineHeight: 1.3 }}>{ticket.title}</h3>
        <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 18 }}>
          Cargado el {shortDate(ticket.created_at)} ({age(ticket.created_at)})
          {ticket.resolved_at ? ` · cerrado el ${shortDate(ticket.resolved_at)}` : ""}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <Field label="Estado">
            <select
              style={input}
              value={ticket.status}
              onChange={(e) => void onChange({ status: e.target.value as Status })}
            >
              {[...COLUMNS, DISCARDED_COLUMN].map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Urgencia">
            <select
              style={input}
              value={ticket.urgency}
              onChange={(e) => void onChange({ urgency: e.target.value as Urgency })}
            >
              {(Object.keys(URGENCY) as Urgency[]).map((key) => (
                <option key={key} value={key}>
                  {URGENCY[key].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Row label={ticket.type === "bug" ? "Qué pasó" : "Qué necesita"} value={ticket.description} />
        <Row label="Qué esperaba que pasara" value={ticket.expected} />
        <Row label="Qué pasó en cambio" value={ticket.actual} />
        <Row label="Reportado por" value={reporter || null} />
        <Row label="Dónde" value={context || null} />

        {ticket.attachment_urls.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", marginBottom: 6 }}>
              Capturas
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ticket.attachment_urls.map((attachment) =>
                attachment.url ? (
                  <a key={attachment.path} href={attachment.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      style={{ width: 150, height: 100, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.border}` }}
                    />
                  </a>
                ) : (
                  <span key={attachment.path} style={{ color: COLORS.muted, fontSize: 12 }}>
                    {attachment.name} (no disponible)
                  </span>
                )
              )}
            </div>
          </div>
        )}

        <Field label="Notas internas (el cliente no las ve)">
          <textarea
            style={{ ...input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            style={button}
            disabled={savingNotes || notes === (ticket.internal_notes ?? "")}
            onClick={async () => {
              setSavingNotes(true);
              await onChange({ internal_notes: notes });
              setSavingNotes(false);
            }}
          >
            {savingNotes ? "Guardando..." : "Guardar notas"}
          </button>
        </div>
      </div>
    </div>
  );
}
