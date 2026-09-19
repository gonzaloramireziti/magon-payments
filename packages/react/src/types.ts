import type { ReactNode } from "react";

export type MagonSubscriptionState =
  | "active"
  | "due"
  | "blocked"
  | "not_found"
  | "inactive";

export type MagonInvoice = {
  id: string;
  period: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "canceled";
};

export type MagonSubscriptionStatus = {
  found: boolean;
  active: boolean;
  blocked: boolean;
  state: MagonSubscriptionState;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  amount: number;
  amountDue: number;
  currency: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  today: string;
  daysUntilDue: number;
  invoices: MagonInvoice[];
  lastPaymentAt: string | null;
};

export type MagonCheckout = {
  alreadyPaid: boolean;
  paymentId: string | null;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  qrData: string | null;
  providerStatus: string | null;
  reference: string | null;
  expiresAt: string | null;
};

export type MagonPayTheme = {
  primary?: string;
  primaryText?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  danger?: string;
  border?: string;
  radius?: number;
  fontFamily?: string;
};

export type MagonPayLabels = {
  loading: string;
  title: string;
  dueTitle: string;
  notFoundTitle: string;
  inactiveTitle: string;
  period: string;
  amountDue: string;
  dueDate: string;
  daysLeft: string;
  overdue: string;
  payNow: string;
  preparing: string;
  openCheckout: string;
  qrHint: string;
  transferHint: string;
  alreadyPaid: string;
  refresh: string;
  refreshing: string;
  contact: string;
  error: string;
  receiptsTitle: string;
  downloadReceipt: string;
  noReceipts: string;
};

export type MagonBranding = {
  logoSrc?: string;
  logo?: ReactNode;
  logoAlt?: string;
};

export const DEFAULT_THEME: Required<MagonPayTheme> = {
  primary: "#ffffff",
  primaryText: "#0a0a0a",
  background: "#08080b",
  surface: "#121216",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  danger: "#f87171",
  border: "#27272a",
  radius: 16,
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export const DEFAULT_LABELS: MagonPayLabels = {
  loading: "Verificando suscripción...",
  title: "Suscripción pendiente",
  dueTitle: "Tu suscripción vence pronto",
  notFoundTitle: "Acceso no válido",
  inactiveTitle: "Cuenta inactiva",
  period: "Período",
  amountDue: "Total a pagar",
  dueDate: "Vence",
  daysLeft: "días restantes",
  overdue: "vencida",
  payNow: "Pagar ahora",
  preparing: "Generando pago...",
  openCheckout: "Abrir pasarela de pago",
  qrHint: "Escaneá el código o usá los datos de transferencia",
  transferHint: "Una vez realizada la transferencia, tocá «Ya pagué».",
  alreadyPaid: "Ya pagué / Actualizar estado",
  refresh: "Actualizar",
  refreshing: "Actualizando...",
  contact: "Contactá a Magon para regularizar tu situación.",
  error: "No se pudo verificar la suscripción",
  receiptsTitle: "Comprobantes de pago",
  downloadReceipt: "Descargar comprobante",
  noReceipts: "Todavía no hay comprobantes disponibles",
};
