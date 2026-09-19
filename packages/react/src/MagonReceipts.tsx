"use client";

import type { CSSProperties } from "react";
import { useMagonSubscription } from "./useSubscription";
import {
  DEFAULT_LABELS,
  DEFAULT_THEME,
  type MagonPayLabels,
  type MagonPayTheme,
} from "./types";

export type MagonReceiptsProps = {
  clientKey: string;
  apiBaseUrl?: string;
  theme?: MagonPayTheme;
  labels?: Partial<MagonPayLabels>;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function periodLabel(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const name = MONTHS[month - 1] ?? period;
  return `${name} ${year}`;
}

function formatMoney(amount: number, currency: string): string {
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

export function MagonReceipts(props: MagonReceiptsProps) {
  const { clientKey, apiBaseUrl = "", theme, labels, title, className, style } = props;
  const t = { ...DEFAULT_THEME, ...theme };
  const l = { ...DEFAULT_LABELS, ...labels };
  const base = apiBaseUrl.replace(/\/$/, "");

  const { status, loading, error } = useMagonSubscription({
    clientKey,
    apiBaseUrl,
    pollIntervalMs: 0,
  });

  const paid = (status?.invoices ?? []).filter((invoice) => invoice.status === "paid");

  const styles: Record<string, CSSProperties> = {
    wrap: {
      fontFamily: t.fontFamily,
      color: t.text,
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius,
      padding: 20,
      ...style,
    },
    title: { margin: "0 0 14px", fontSize: 16, fontWeight: 700 },
    empty: { fontSize: 13, color: t.muted, margin: 0 },
    item: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 0",
      borderTop: `1px solid ${t.border}`,
    },
    period: { fontSize: 13, fontWeight: 600 },
    amount: { fontSize: 12, color: t.muted },
    link: {
      display: "inline-block",
      border: `1px solid ${t.primary}`,
      color: t.primary,
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 12,
      fontWeight: 700,
      textDecoration: "none",
      whiteSpace: "nowrap",
    },
  };

  return (
    <div className={className} style={styles.wrap}>
      <h3 style={styles.title}>{title ?? l.receiptsTitle}</h3>

      {loading && <p style={styles.empty}>{l.loading}</p>}
      {!loading && error && <p style={styles.empty}>{`${l.error}: ${error}`}</p>}
      {!loading && !error && paid.length === 0 && <p style={styles.empty}>{l.noReceipts}</p>}

      {!loading &&
        !error &&
        paid.map((invoice) => (
          <div key={invoice.id} style={styles.item}>
            <div>
              <div style={styles.period}>{periodLabel(invoice.period)}</div>
              <div style={styles.amount}>{formatMoney(invoice.amount, invoice.currency)}</div>
            </div>
            <a
              style={styles.link}
              href={`${base}/api/receipts?key=${encodeURIComponent(clientKey)}&invoiceId=${encodeURIComponent(invoice.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              {l.downloadReceipt}
            </a>
          </div>
        ))}
    </div>
  );
}
