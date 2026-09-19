"use client";

import { useEffect, type ReactNode } from "react";
import { useMagonSubscription } from "./useSubscription";
import { PaymentBlockedScreen } from "./PaymentBlockedScreen";
import {
  DEFAULT_LABELS,
  DEFAULT_THEME,
  type MagonCheckout,
  type MagonPayLabels,
  type MagonPayTheme,
  type MagonSubscriptionStatus,
} from "./types";

export type MagonPayGateRenderContext = {
  status: MagonSubscriptionStatus;
  checkout: MagonCheckout | null;
  createCheckout: () => Promise<MagonCheckout | null>;
  creatingCheckout: boolean;
  checkoutError: string | null;
  refresh: () => Promise<MagonSubscriptionStatus | null>;
  refreshing: boolean;
};

export type MagonPayGateProps = {
  clientKey: string;
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  theme?: MagonPayTheme;
  labels?: Partial<MagonPayLabels>;
  children: ReactNode;
  enforce?: boolean;
  renderBlocked?: (context: MagonPayGateRenderContext) => ReactNode;
  renderLoading?: () => ReactNode;
  onStatusChange?: (status: MagonSubscriptionStatus) => void;
};

export function MagonPayGate(props: MagonPayGateProps) {
  const {
    clientKey,
    apiBaseUrl = "",
    pollIntervalMs = 15000,
    theme,
    labels,
    children,
    enforce = true,
    renderBlocked,
    renderLoading,
    onStatusChange,
  } = props;

  const subscription = useMagonSubscription({ clientKey, apiBaseUrl, pollIntervalMs });
  const { status, loading, error, refresh, createCheckout, creatingCheckout, checkoutError, checkout, refreshing } =
    subscription;

  useEffect(() => {
    if (status && onStatusChange) onStatusChange(status);
  }, [status, onStatusChange]);

  const t = { ...DEFAULT_THEME, ...theme };
  const l = { ...DEFAULT_LABELS, ...labels };

  if (!enforce) {
    return <>{children}</>;
  }

  if (loading && !status) {
    if (renderLoading) return <>{renderLoading()}</>;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: t.background,
          color: t.muted,
          fontFamily: t.fontFamily,
          fontSize: 15,
        }}
      >
        {l.loading}
      </div>
    );
  }

  if (!status) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: t.background,
          color: t.danger,
          fontFamily: t.fontFamily,
          padding: 24,
          textAlign: "center",
        }}
      >
        {error ? `${l.error}: ${error}` : l.error}
      </div>
    );
  }

  if (status.blocked) {
    if (renderBlocked) {
      return (
        <>
          {renderBlocked({
            status,
            checkout,
            createCheckout,
            creatingCheckout,
            checkoutError,
            refresh,
            refreshing,
          })}
        </>
      );
    }
    return (
      <PaymentBlockedScreen
        status={status}
        checkout={checkout}
        onCreateCheckout={() => {
          void createCheckout();
        }}
        creatingCheckout={creatingCheckout}
        checkoutError={checkoutError}
        refreshing={refreshing}
        onRefresh={() => {
          void refresh();
        }}
        theme={theme}
        labels={labels}
      />
    );
  }

  return <>{children}</>;
}
