"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, type MagonPayTheme } from "./types";

export type MagonTicketType = "bug" | "feature";
export type MagonTicketUrgency = "low" | "medium" | "high" | "critical";
export type MagonTicketStatus =
  | "new"
  | "analysis"
  | "ready"
  | "in_progress"
  | "testing"
  | "done"
  | "discarded";

export type MagonSupportReporter = {
  name?: string | null;
  email?: string | null;
  /** Identificador del usuario en la app del cliente (id, legajo, usuario). */
  id?: string | number | null;
};

export type MagonClientTicket = {
  number: number;
  type: MagonTicketType;
  title: string;
  status: MagonTicketStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export type MagonSupportLabels = {
  trigger: string;
  title: string;
  tabNew: string;
  tabMine: string;
  typeBug: string;
  typeFeature: string;
  fieldTitle: string;
  fieldTitleBug: string;
  fieldTitleFeature: string;
  fieldDescriptionBug: string;
  fieldDescriptionFeature: string;
  fieldExpected: string;
  fieldActual: string;
  fieldUrgency: string;
  fieldAttachments: string;
  attachmentsHint: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successText: string;
  another: string;
  close: string;
  loading: string;
  noTickets: string;
  disabled: string;
  urgency: Record<MagonTicketUrgency, string>;
  status: Record<MagonTicketStatus, string>;
};

export const DEFAULT_SUPPORT_LABELS: MagonSupportLabels = {
  trigger: "Reportar",
  title: "Soporte Magon",
  tabNew: "Nuevo reporte",
  tabMine: "Mis reportes",
  typeBug: "Algo no funciona",
  typeFeature: "Quiero algo nuevo",
  fieldTitle: "Resumen en una línea",
  fieldTitleBug: "Ej: No se genera el recibo al cobrar un alquiler",
  fieldTitleFeature: "Ej: Poder exportar los contratos a Excel",
  fieldDescriptionBug: "¿Qué estabas haciendo cuando pasó?",
  fieldDescriptionFeature: "¿Qué necesitás y para qué te sirve?",
  fieldExpected: "¿Qué esperabas que pasara?",
  fieldActual: "¿Qué pasó en cambio?",
  fieldUrgency: "¿Cuánto te afecta?",
  fieldAttachments: "Capturas de pantalla",
  attachmentsHint: "Hasta 3 imágenes. También podés pegarlas con Ctrl+V / Cmd+V.",
  submit: "Enviar reporte",
  submitting: "Enviando...",
  successTitle: "¡Recibimos tu reporte!",
  successText: "Lo vamos a revisar y podés seguir su estado en «Mis reportes».",
  another: "Cargar otro",
  close: "Cerrar",
  loading: "Cargando...",
  noTickets: "Todavía no cargaste reportes.",
  disabled: "Los reportes no están habilitados para esta cuenta.",
  urgency: {
    low: "Puedo seguir trabajando normalmente",
    medium: "Me complica, pero puedo seguir",
    high: "No puedo usar una parte del sistema",
    critical: "No puedo usar el sistema",
  },
  status: {
    new: "Recibido",
    analysis: "En análisis",
    ready: "Planificado",
    in_progress: "En desarrollo",
    testing: "En prueba",
    done: "Resuelto",
    discarded: "Cerrado",
  },
};

export type MagonSupportProps = {
  clientKey: string;
  apiBaseUrl?: string;
  /** Desde dónde se reporta: "admin", "portal", etc. Define qué tipos se permiten. */
  channel?: string;
  reporter?: MagonSupportReporter;
  appVersion?: string;
  theme?: MagonPayTheme;
  labels?: Partial<Omit<MagonSupportLabels, "urgency" | "status">> & {
    urgency?: Partial<MagonSupportLabels["urgency"]>;
    status?: Partial<MagonSupportLabels["status"]>;
  };
  position?: "bottom-right" | "bottom-left";
  /** Oculta el botón flotante; se abre con `open` desde un menú propio. */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTrigger?: (open: () => void) => ReactNode;
  onSubmitted?: (ticket: { id: string; number: number }) => void;
};

type Config = { clientName: string; channel: string; types: MagonTicketType[] };

const MAX_FILES = 3;
const MAX_SIDE = 1600;

// Achica las capturas antes de subirlas: el backend acepta hasta 4 MB en total.
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function MagonSupport(props: MagonSupportProps) {
  const {
    clientKey,
    apiBaseUrl = "",
    channel = "default",
    reporter,
    appVersion,
    theme,
    labels,
    position = "bottom-right",
    hideTrigger = false,
    open: controlledOpen,
    onOpenChange,
    renderTrigger,
    onSubmitted,
  } = props;

  const t = { ...DEFAULT_THEME, ...theme };
  const l: MagonSupportLabels = {
    ...DEFAULT_SUPPORT_LABELS,
    ...labels,
    urgency: { ...DEFAULT_SUPPORT_LABELS.urgency, ...labels?.urgency },
    status: { ...DEFAULT_SUPPORT_LABELS.status, ...labels?.status },
  };
  const base = apiBaseUrl.replace(/\/$/, "");

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [controlledOpen, onOpenChange]
  );

  const [tab, setTab] = useState<"new" | "mine">("new");
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [type, setType] = useState<MagonTicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [urgency, setUrgency] = useState<MagonTicketUrgency>("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [mine, setMine] = useState<MagonClientTicket[] | null>(null);

  useEffect(() => {
    if (!isOpen || config) return;
    const url = `${base}/api/support/config?key=${encodeURIComponent(clientKey)}&channel=${encodeURIComponent(channel)}`;
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setConfig(data.config as Config);
        if (!data.config.types.includes("bug") && data.config.types.includes("feature")) setType("feature");
      })
      .catch((err: Error) => setConfigError(err.message));
  }, [isOpen, config, base, clientKey, channel]);

  useEffect(() => {
    if (!isOpen || tab !== "mine") return;
    setMine(null);
    fetch(`${base}/api/support/tickets?key=${encodeURIComponent(clientKey)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setMine(data.tickets as MagonClientTicket[]);
      })
      .catch(() => setMine([]));
  }, [isOpen, tab, base, clientKey, sent]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setOpen]);

  async function addFiles(list: FileList | File[]) {
    const images = Array.from(list).filter((file) => file.type.startsWith("image/"));
    const shrunk = await Promise.all(images.map(shrinkImage));
    setFiles((current) => [...current, ...shrunk].slice(0, MAX_FILES));
  }

  function onPaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData.files ?? []);
    if (pasted.length > 0) {
      event.preventDefault();
      void addFiles(pasted);
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setExpected("");
    setActual("");
    setUrgency("medium");
    setFiles([]);
    setError(null);
    setSent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("clientKey", clientKey);
    form.set("channel", channel);
    form.set("type", type);
    form.set("title", title);
    form.set("description", description);
    if (type === "bug") {
      form.set("expected", expected);
      form.set("actual", actual);
    }
    form.set("urgency", urgency);
    if (reporter?.name) form.set("reporterName", String(reporter.name));
    if (reporter?.email) form.set("reporterEmail", String(reporter.email));
    if (reporter?.id !== undefined && reporter?.id !== null) form.set("reporterRef", String(reporter.id));
    if (appVersion) form.set("appVersion", appVersion);
    if (typeof window !== "undefined") form.set("pageUrl", window.location.href);
    if (typeof navigator !== "undefined") form.set("userAgent", navigator.userAgent);
    for (const file of files) form.append("attachments", file, file.name);

    try {
      const response = await fetch(`${base}/api/support/tickets`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setSent(data.ticket.number as number);
      onSubmitted?.(data.ticket);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const field: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: Math.max(6, t.radius - 8),
    border: `1px solid ${t.border}`,
    background: t.background,
    color: t.text,
    fontSize: 14,
    fontFamily: t.fontFamily,
    boxSizing: "border-box",
  };
  const label: CSSProperties = { display: "grid", gap: 6, fontSize: 13, color: t.text };
  const primary: CSSProperties = {
    padding: "11px 16px",
    borderRadius: Math.max(6, t.radius - 6),
    border: "none",
    background: t.primary,
    color: t.primaryText,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: t.fontFamily,
  };
  const secondary: CSSProperties = {
    ...primary,
    background: "transparent",
    color: t.text,
    border: `1px solid ${t.border}`,
    fontWeight: 600,
  };
  const types = config?.types ?? [];

  const trigger = renderTrigger ? (
    renderTrigger(() => setOpen(true))
  ) : hideTrigger ? null : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={l.title}
      style={{
        ...primary,
        position: "fixed",
        bottom: 20,
        [position === "bottom-left" ? "left" : "right"]: 20,
        zIndex: 2147483000,
        borderRadius: 999,
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        padding: "11px 18px",
      }}
    >
      {l.trigger}
    </button>
  );

  return (
    <>
      {trigger}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={l.title}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483001,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: t.fontFamily,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            onPaste={onPaste}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: t.surface,
              color: t.text,
              border: `1px solid ${t.border}`,
              borderRadius: t.radius,
              padding: 20,
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <strong style={{ fontSize: 17 }}>{l.title}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label={l.close} style={{ ...secondary, padding: "6px 10px" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {(["new", "mine"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  style={{
                    ...secondary,
                    padding: "7px 12px",
                    fontSize: 13,
                    background: tab === item ? t.background : "transparent",
                    color: tab === item ? t.text : t.muted,
                  }}
                >
                  {item === "new" ? l.tabNew : l.tabMine}
                </button>
              ))}
            </div>

            {tab === "mine" && (
              <div style={{ display: "grid", gap: 8 }}>
                {mine === null && <div style={{ color: t.muted, fontSize: 14 }}>{l.loading}</div>}
                {mine?.length === 0 && <div style={{ color: t.muted, fontSize: 14 }}>{l.noTickets}</div>}
                {mine?.map((ticket) => (
                  <div
                    key={ticket.number}
                    style={{ border: `1px solid ${t.border}`, borderRadius: Math.max(6, t.radius - 6), padding: "10px 12px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: t.muted }}>
                      <span>
                        #{ticket.number} · {ticket.type === "bug" ? l.typeBug : l.typeFeature}
                      </span>
                      <span style={{ fontWeight: 700, color: ticket.status === "done" ? "#4ade80" : t.text }}>
                        {l.status[ticket.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>{ticket.title}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === "new" && sent !== null && (
              <div style={{ textAlign: "center", padding: "18px 4px" }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {l.successTitle} (#{sent})
                </div>
                <div style={{ color: t.muted, fontSize: 14, marginBottom: 18 }}>{l.successText}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button type="button" style={secondary} onClick={reset}>
                    {l.another}
                  </button>
                  <button type="button" style={primary} onClick={() => setOpen(false)}>
                    {l.close}
                  </button>
                </div>
              </div>
            )}

            {tab === "new" && sent === null && (
              <>
                {!config && !configError && <div style={{ color: t.muted, fontSize: 14 }}>{l.loading}</div>}
                {configError && <div style={{ color: t.danger, fontSize: 14 }}>{configError}</div>}
                {config && types.length === 0 && <div style={{ color: t.muted, fontSize: 14 }}>{l.disabled}</div>}
                {config && types.length > 0 && (
                  <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
                    {types.length > 1 && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {types.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setType(item)}
                            aria-pressed={type === item}
                            style={{
                              ...secondary,
                              borderColor: type === item ? t.text : t.border,
                              background: type === item ? t.background : "transparent",
                            }}
                          >
                            {item === "bug" ? l.typeBug : l.typeFeature}
                          </button>
                        ))}
                      </div>
                    )}

                    <label style={label}>
                      {l.fieldTitle}
                      <input
                        style={field}
                        value={title}
                        maxLength={140}
                        required
                        placeholder={type === "bug" ? l.fieldTitleBug : l.fieldTitleFeature}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>

                    <label style={label}>
                      {type === "bug" ? l.fieldDescriptionBug : l.fieldDescriptionFeature}
                      <textarea
                        style={{ ...field, minHeight: 90, resize: "vertical" }}
                        value={description}
                        required
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </label>

                    {type === "bug" && (
                      <>
                        <label style={label}>
                          {l.fieldExpected}
                          <textarea
                            style={{ ...field, minHeight: 60, resize: "vertical" }}
                            value={expected}
                            onChange={(e) => setExpected(e.target.value)}
                          />
                        </label>
                        <label style={label}>
                          {l.fieldActual}
                          <textarea
                            style={{ ...field, minHeight: 60, resize: "vertical" }}
                            value={actual}
                            onChange={(e) => setActual(e.target.value)}
                          />
                        </label>
                      </>
                    )}

                    <label style={label}>
                      {l.fieldUrgency}
                      <select style={field} value={urgency} onChange={(e) => setUrgency(e.target.value as MagonTicketUrgency)}>
                        {(Object.keys(l.urgency) as MagonTicketUrgency[]).map((key) => (
                          <option key={key} value={key}>
                            {l.urgency[key]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div style={label}>
                      {l.fieldAttachments}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        disabled={files.length >= MAX_FILES}
                        onChange={(e) => {
                          if (e.target.files) void addFiles(e.target.files);
                          e.target.value = "";
                        }}
                        style={{ fontSize: 13, color: t.muted }}
                      />
                      <span style={{ fontSize: 12, color: t.muted }}>{l.attachmentsHint}</span>
                      {files.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {files.map((file, index) => (
                            <button
                              key={`${file.name}-${index}`}
                              type="button"
                              onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                              title="Quitar"
                              style={{ ...secondary, padding: "5px 9px", fontSize: 12 }}
                            >
                              {file.name.slice(0, 24)} ✕
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {error && <div style={{ color: t.danger, fontSize: 13 }}>{error}</div>}

                    <button type="submit" style={primary} disabled={sending}>
                      {sending ? l.submitting : l.submit}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
