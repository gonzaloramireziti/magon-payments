"use client";

import { useEffect, useState } from "react";

export default function MockCheckoutPage() {
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReference(params.get("ref") ?? "");
    setAmount(params.get("amount") ?? "");
    setCurrency(params.get("currency") ?? "ARS");
  }, []);

  async function simulatePayment() {
    if (!reference) return;
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/mock/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await response.json();
      setStatus(
        data?.ok
          ? "Pago simulado aprobado. Volvé a tu app y tocá «Ya pagué»."
          : `Error: ${data?.error ?? "desconocido"}`
      );
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 10px 30px rgba(15,23,42,.08)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", letterSpacing: 0.4 }}>
          CHECKOUT SIMULADO (MOCK)
        </div>
        <h1 style={{ margin: "10px 0 4px", fontSize: 22 }}>Pasarela de prueba</h1>
        <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: 14 }}>
          Modo desarrollo: no se cobra dinero real.
        </p>

        <div style={{ fontSize: 14, color: "#64748b" }}>Total</div>
        <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 18 }}>
          {currency} {amount}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", wordBreak: "break-all", marginBottom: 18 }}>
          Ref: {reference}
        </div>

        <button
          type="button"
          onClick={simulatePayment}
          disabled={loading || !reference}
          style={{
            width: "100%",
            padding: "14px 18px",
            border: "none",
            borderRadius: 14,
            background: "#6d28d9",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Procesando..." : "Simular transferencia aprobada"}
        </button>

        {status && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#0f172a" }}>{status}</div>
        )}
      </div>
    </main>
  );
}
