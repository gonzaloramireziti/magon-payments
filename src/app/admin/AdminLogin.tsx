"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

const input: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #27272a",
  background: "#0b0b0f",
  color: "#f4f4f5",
  fontSize: 14,
  boxSizing: "border-box",
};

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No autorizado");
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
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
        background: "#08080b",
        color: "#f4f4f5",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#121216",
          border: "1px solid #27272a",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>Administración Magon</h1>
        <p style={{ margin: "0 0 20px", color: "#a1a1aa", fontSize: 13 }}>
          Ingresá con las credenciales configuradas en el servidor.
        </p>

        <label style={{ fontSize: 12, color: "#a1a1aa" }}>Usuario</label>
        <input
          style={{ ...input, margin: "6px 0 14px" }}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
        />

        <label style={{ fontSize: 12, color: "#a1a1aa" }}>Contraseña</label>
        <input
          style={{ ...input, margin: "6px 0 18px" }}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px 18px",
            border: "none",
            borderRadius: 12,
            background: "#ffffff",
            color: "#0a0a0a",
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        {error && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#f87171" }}>{error}</div>
        )}
      </form>
    </main>
  );
}
