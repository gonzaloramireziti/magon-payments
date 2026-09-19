"use client";

import { useEffect, useState } from "react";

export default function PagoPage() {
  const [paid, setPaid] = useState<string | null>(null);

  useEffect(() => {
    setPaid(new URLSearchParams(window.location.search).get("paid"));
  }, []);

  const success = paid === "1";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#08080b",
        color: "#f4f4f5",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#121216",
          border: "1px solid #27272a",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34, marginBottom: 8 }}>{success ? "✓" : "!"}</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>
          {success ? "Pago recibido" : "Pago no completado"}
        </h1>
        <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14, lineHeight: 1.5 }}>
          {success
            ? "Estamos acreditando tu pago. Volvé a la aplicación y actualizá el estado en unos segundos."
            : "El pago no se completó. Podés intentarlo nuevamente desde la aplicación."}
        </p>
      </div>
    </main>
  );
}
