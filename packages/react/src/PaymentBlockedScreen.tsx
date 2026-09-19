"use client";

import type { CSSProperties } from "react";
import {
  DEFAULT_LABELS,
  DEFAULT_THEME,
  type MagonCheckout,
  type MagonPayLabels,
  type MagonPayTheme,
  type MagonSubscriptionStatus,
} from "./types";

export type PaymentBlockedScreenProps = {
  status: MagonSubscriptionStatus;
  checkout: MagonCheckout | null;
  onCreateCheckout: () => void;
  creatingCheckout: boolean;
  checkoutError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  theme?: MagonPayTheme;
  labels?: Partial<MagonPayLabels>;
};

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

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function isHttp(value: string | null): boolean {
  return !!value && /^https?:\/\//i.test(value);
}

export function PaymentBlockedScreen(props: PaymentBlockedScreenProps) {
  const {
    status,
    checkout,
    onCreateCheckout,
    creatingCheckout,
    checkoutError,
    refreshing,
    onRefresh,
    theme,
    labels,
  } = props;

  const t = { ...DEFAULT_THEME, ...theme };
  const l = { ...DEFAULT_LABELS, ...labels };

  const styles: Record<string, CSSProperties> = {
    wrapper: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: t.background,
      fontFamily: t.fontFamily,
      color: t.text,
    },
    card: {
      width: "100%",
      maxWidth: 460,
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius,
      padding: 28,
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
      boxSizing: "border-box",
    },
    badge: {
      display: "inline-block",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: t.primary,
      background: `${t.primary}1a`,
      borderRadius: 999,
      padding: "4px 10px",
      marginBottom: 14,
    },
    title: { margin: "0 0 6px", fontSize: 22, lineHeight: 1.2 },
    subtitle: { margin: "0 0 20px", fontSize: 14, color: t.muted },
    row: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 0",
      borderTop: `1px solid ${t.border}`,
      fontSize: 14,
    },
    label: { color: t.muted },
    value: { fontWeight: 600, textAlign: "right" },
    amount: {
      fontSize: 30,
      fontWeight: 800,
      margin: "4px 0 18px",
      color: t.text,
    },
    button: {
      width: "100%",
      border: "none",
      borderRadius: t.radius,
      padding: "14px 18px",
      fontSize: 15,
      fontWeight: 700,
      cursor: creatingCheckout ? "wait" : "pointer",
      background: t.primary,
      color: t.primaryText,
      opacity: creatingCheckout ? 0.7 : 1,
    },
    ghost: {
      width: "100%",
      marginTop: 10,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius,
      padding: "12px 18px",
      fontSize: 14,
      fontWeight: 600,
      cursor: refreshing ? "wait" : "pointer",
      background: "transparent",
      color: t.text,
    },
    link: {
      display: "block",
      textAlign: "center",
      marginTop: 12,
      fontSize: 14,
      fontWeight: 600,
      color: t.primary,
      textDecoration: "none",
    },
    error: {
      marginTop: 12,
      fontSize: 13,
      color: t.danger,
      background: `${t.danger}12`,
      border: `1px solid ${t.danger}33`,
      borderRadius: 10,
      padding: "10px 12px",
    },
    code: {
      marginTop: 12,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      wordBreak: "break-all",
      background: t.background,
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      padding: 12,
    },
    hint: { marginTop: 14, fontSize: 13, color: t.muted, lineHeight: 1.5 },
    invoice: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 13,
      padding: "6px 0",
      color: t.muted,
    },
  };

  if (status.state === "not_found") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.badge}>{l.contact}</div>
          <h1 style={styles.title}>{l.notFoundTitle}</h1>
          <p style={styles.subtitle}>{l.contact}</p>
        </div>
      </div>
    );
  }

  if (status.state === "inactive") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.badge}>{l.contact}</div>
          <h1 style={styles.title}>{l.inactiveTitle}</h1>
          <p style={styles.subtitle}>{l.contact}</p>
        </div>
      </div>
    );
  }

  const isDue = status.state === "due";
  const title = isDue ? l.dueTitle : l.title;
  const unpaid = status.invoices.filter(
    (invoice) => invoice.status === "pending" || invoice.status === "overdue"
  );

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.badge}>
          {status.state === "blocked" ? l.overdue : status.periodLabel}
        </div>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>
          {status.clientName ?? ""}
          {status.clientName ? " · " : ""}
          {l.period}: {status.periodLabel}
        </p>

        <div style={styles.label}>{l.amountDue}</div>
        <div style={styles.amount}>
          {formatMoney(status.amountDue, status.currency)}
        </div>

        <div style={styles.row}>
          <span style={styles.label}>{l.dueDate}</span>
          <span style={styles.value}>{formatDate(status.dueDate)}</span>
        </div>
        {!isDue && (
          <div style={styles.row}>
            <span style={styles.label}>{l.daysLeft}</span>
            <span style={styles.value}>
              {status.daysUntilDue >= 0 ? status.daysUntilDue : l.overdue}
            </span>
          </div>
        )}

        {unpaid.length > 1 && (
          <div style={{ marginTop: 10 }}>
            {unpaid.map((invoice) => (
              <div key={invoice.id} style={styles.invoice}>
                <span>{invoice.period}</span>
                <span>{formatMoney(invoice.amount, invoice.currency)}</span>
              </div>
            ))}
          </div>
        )}

        {!checkout && (
          <button
            type="button"
            style={{ ...styles.button, marginTop: 22 }}
            onClick={onCreateCheckout}
            disabled={creatingCheckout}
          >
            {creatingCheckout ? l.preparing : l.payNow}
          </button>
        )}

        {checkout && (
          <div style={{ marginTop: 18 }}>
            {isHttp(checkout.checkoutUrl) && (
              <a
                style={{ ...styles.button, display: "block", textAlign: "center", textDecoration: "none" }}
                href={checkout.checkoutUrl as string}
                target="_blank"
                rel="noreferrer"
              >
                {l.openCheckout}
              </a>
            )}
            {checkout.qrData && !isHttp(checkout.qrData) && (
              <>
                <div style={styles.hint}>{l.qrHint}</div>
                <div style={styles.code}>{checkout.qrData}</div>
              </>
            )}
            {checkout.qrData && isHttp(checkout.qrData) && (
              <a style={styles.link} href={checkout.qrData} target="_blank" rel="noreferrer">
                {l.openCheckout}
              </a>
            )}
            <div style={styles.hint}>{l.transferHint}</div>
          </div>
        )}

        {checkoutError && <div style={styles.error}>{checkoutError}</div>}

        <button
          type="button"
          style={styles.ghost}
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? l.refreshing : l.alreadyPaid}
        </button>
      </div>
    </div>
  );
}
