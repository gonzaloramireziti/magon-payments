"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MagonCheckout, MagonSubscriptionStatus } from "./types";

export type UseMagonSubscriptionOptions = {
  clientKey: string;
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  enabled?: boolean;
  returnUrl?: string;
};

export type UseMagonSubscriptionResult = {
  status: MagonSubscriptionStatus | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<MagonSubscriptionStatus | null>;
  createCheckout: () => Promise<MagonCheckout | null>;
  creatingCheckout: boolean;
  checkoutError: string | null;
  checkout: MagonCheckout | null;
};

type StatusEnvelope = { ok: boolean; status?: MagonSubscriptionStatus; error?: string };
type CheckoutEnvelope = { ok: boolean; checkout?: MagonCheckout; error?: string };

export function useMagonSubscription(
  options: UseMagonSubscriptionOptions
): UseMagonSubscriptionResult {
  const {
    clientKey,
    apiBaseUrl = "",
    pollIntervalMs = 15000,
    enabled = true,
    returnUrl,
  } = options;

  const base = apiBaseUrl.replace(/\/$/, "");
  const [status, setStatus] = useState<MagonSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<MagonCheckout | null>(null);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<MagonSubscriptionStatus | null> => {
    if (!clientKey) {
      setError("Falta clientKey");
      setLoading(false);
      return null;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(
        `${base}/api/subscription/status?key=${encodeURIComponent(clientKey)}`,
        { signal: controller.signal, cache: "no-store" }
      );
      const data = (await response.json()) as StatusEnvelope;
      if (!response.ok || !data.ok || !data.status) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setStatus(data.status);
      setError(null);
      return data.status;
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
      setError((err as Error).message);
      return null;
    } finally {
      if (abortRef.current === controller) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [base, clientKey]);

  const createCheckout = useCallback(async (): Promise<MagonCheckout | null> => {
    if (!clientKey) return null;
    setCreatingCheckout(true);
    setCheckoutError(null);
    try {
      const target =
        returnUrl ??
        (typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : undefined);
      const response = await fetch(`${base}/api/payments/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientKey, returnUrl: target }),
        cache: "no-store",
      });
      const data = (await response.json()) as CheckoutEnvelope;
      if (!response.ok || !data.ok || !data.checkout) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setCheckout(data.checkout);
      if (data.checkout.alreadyPaid) {
        await refresh();
      }
      return data.checkout;
    } catch (err) {
      setCheckoutError((err as Error).message);
      return null;
    } finally {
      setCreatingCheckout(false);
    }
  }, [base, clientKey, refresh, returnUrl]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    return () => abortRef.current?.abort();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !pollIntervalMs || pollIntervalMs <= 0) return;
    const shouldPoll = status?.state === "due" || status?.state === "blocked";
    if (!shouldPoll) return;
    const id = setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [enabled, pollIntervalMs, status?.state, refresh]);

  return {
    status,
    loading,
    refreshing,
    error,
    refresh,
    createCheckout,
    creatingCheckout,
    checkoutError,
    checkout,
  };
}
