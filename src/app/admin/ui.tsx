"use client";

import type { CSSProperties, ReactNode } from "react";

export const COLORS = {
  bg: "#08080b",
  surface: "#121216",
  border: "#27272a",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  danger: "#f87171",
  ok: "#4ade80",
  warn: "#facc15",
  accent: "#8b5cf6",
};

export const input: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: 13,
  boxSizing: "border-box",
};

export const button: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 9,
  border: "none",
  background: "#ffffff",
  color: "#0a0a0a",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

export const ghost: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 9,
  border: `1px solid ${COLORS.border}`,
  background: "transparent",
  color: COLORS.text,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

export const banner: CSSProperties = {
  border: "1px solid",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  marginBottom: 14,
};

export const th: CSSProperties = { padding: "12px 14px", fontWeight: 700 };
export const td: CSSProperties = { padding: "12px 14px", verticalAlign: "middle" };

export function money(amount: number, currency: string): string {
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

export function shortDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

export function Card({
  title,
  value,
  hint,
  color,
}: {
  title: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 16,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? COLORS.text, wordBreak: "break-word" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
