"use client";

import { notifications } from "@mantine/notifications";

export type ApiError = Error & { code?: string | null; status?: number };

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    cache: "no-store",
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { "content-type": "application/json", ...(rest.headers ?? {}) } }
      : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.location.reload();
    throw Object.assign(new Error(data.error ?? `Error ${response.status}`), {
      code: data.code ?? null,
      status: response.status,
    }) as ApiError;
  }
  return data as T;
}

export function notifyError(error: unknown) {
  notifications.show({ color: "red", title: "No se pudo completar", message: (error as Error).message });
}

export function notifyOk(message: string) {
  notifications.show({ color: "teal", message });
}
