"use client";

import { useState } from "react";
import { MagonPayGate } from "magon-pay-react";

const DEFAULT_KEY = process.env.NEXT_PUBLIC_DEMO_CLIENT_KEY ?? "magon-demo-key";

export default function HomePage() {
  const [clientKey, setClientKey] = useState(DEFAULT_KEY);
  const [activeKey, setActiveKey] = useState(DEFAULT_KEY);

  return (
    <MagonPayGate
      clientKey={activeKey}
      apiBaseUrl={process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}
      pollIntervalMs={15000}
      theme={{ primary: "#6d28d9" }}
    >
      <main
        style={{
          minHeight: "100vh",
          padding: 32,
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "#e2e8f0",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Panel de Magon</h1>
        <p style={{ color: "#94a3b8" }}>
          Suscripción activa. Este contenido sólo se ve si el cliente está al día.
        </p>

        <div style={{ marginTop: 24, display: "flex", gap: 8, maxWidth: 520 }}>
          <input
            value={clientKey}
            onChange={(event) => setClientKey(event.target.value)}
            placeholder="KEY del cliente"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#e2e8f0",
            }}
          />
          <button
            type="button"
            onClick={() => setActiveKey(clientKey)}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#6d28d9",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cargar KEY
          </button>
        </div>
      </main>
    </MagonPayGate>
  );
}
