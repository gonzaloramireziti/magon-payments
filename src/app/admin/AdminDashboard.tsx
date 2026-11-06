"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminOverview } from "./AdminOverview";
import { AdminClients } from "./AdminClients";
import { AdminPayments } from "./AdminPayments";
import { AdminCosts } from "./AdminCosts";
import { AdminBoard } from "./AdminBoard";
import { COLORS, banner, ghost } from "./ui";

const SECTIONS = [
  { id: "inicio", label: "Inicio" },
  { id: "clientes", label: "Clientes" },
  { id: "cobros", label: "Cobros" },
  { id: "costos", label: "Costos" },
  { id: "tablero", label: "Tablero" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function sectionFromHash(): SectionId {
  if (typeof window === "undefined") return "inicio";
  const hash = window.location.hash.replace("#", "");
  return SECTIONS.some((section) => section.id === hash) ? (hash as SectionId) : "inicio";
}

// Layout responsive: los estilos en línea no admiten media queries.
const LAYOUT_CSS = `
.mg-shell { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 28px; max-width: 1500px; margin: 0 auto; }
.mg-nav { position: sticky; top: 24px; align-self: start; display: grid; gap: 4px; }
.mg-nav button { text-align: left; }
.mg-two-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0 20px; }
.mg-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 860px) {
  .mg-shell { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .mg-nav { position: static; display: flex; overflow-x: auto; gap: 6px; padding-bottom: 4px; }
  .mg-nav button { white-space: nowrap; }
  .mg-two-cols { grid-template-columns: minmax(0, 1fr); }
  .mg-table thead { display: none; }
  .mg-table tr { display: block; padding: 8px 0; }
  .mg-table td { display: flex; justify-content: space-between; gap: 12px; padding: 6px 14px !important; text-align: right; }
  .mg-table td[data-label]::before { content: attr(data-label); color: ${COLORS.muted}; font-size: 11px; text-transform: uppercase; text-align: left; }
  .mg-table td.mg-actions { justify-content: flex-start; flex-wrap: wrap; gap: 6px; white-space: normal !important; }
  .mg-table td.mg-actions > * { margin-left: 0 !important; }
  .mg-table tr.mg-detail td { display: block; text-align: left; }
}
`;

export function AdminDashboard() {
  const [section, setSection] = useState<SectionId>("inicio");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setSection(sectionFromHash());
    const onHash = () => {
      setSection(sectionFromHash());
      setMessage(null);
      setError(null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((id: SectionId) => {
    window.location.hash = id;
    setSection(id);
    setMessage(null);
    setError(null);
  }, []);

  const showMessage = useCallback((text: string) => {
    setError(null);
    setMessage(text);
  }, []);
  const showError = useCallback((text: string) => {
    setMessage(null);
    setError(text);
  }, []);
  const changed = useCallback(() => setReloadKey((key) => key + 1), []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        padding: "24px 16px 60px",
      }}
    >
      <style>{LAYOUT_CSS}</style>
      <div className="mg-shell">
        <nav className="mg-nav" aria-label="Secciones">
          <div style={{ fontWeight: 800, fontSize: 17, padding: "4px 12px 14px" }}>Magon</div>
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              style={{
                ...ghost,
                border: "1px solid transparent",
                background: section === item.id ? COLORS.surface : "transparent",
                borderColor: section === item.id ? COLORS.border : "transparent",
                color: section === item.id ? COLORS.text : COLORS.muted,
                fontSize: 13,
                padding: "9px 12px",
              }}
            >
              {item.label}
            </button>
          ))}
          <button type="button" style={{ ...ghost, marginTop: 12, color: COLORS.muted }} onClick={logout}>
            Salir
          </button>
        </nav>

        <div style={{ minWidth: 0 }}>
          {message && (
            <div style={{ ...banner, color: COLORS.ok, borderColor: `${COLORS.ok}55` }}>{message}</div>
          )}
          {error && (
            <div style={{ ...banner, color: COLORS.danger, borderColor: `${COLORS.danger}55` }}>{error}</div>
          )}

          {section === "inicio" && <AdminOverview reloadKey={reloadKey} onOpenBoard={() => go("tablero")} />}
          {section === "clientes" && (
            <AdminClients onChanged={changed} onMessage={showMessage} onError={showError} />
          )}
          {section === "cobros" && <AdminPayments reloadKey={reloadKey} />}
          {section === "costos" && <AdminCosts onChanged={changed} defaultOpen />}
          {section === "tablero" && <AdminBoard onError={showError} />}
        </div>
      </div>
    </main>
  );
}
