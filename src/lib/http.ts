import { NextResponse } from "next/server";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorJson(message: string, status = 400, code?: string): NextResponse {
  return json({ ok: false, error: message, code: code ?? null }, { status });
}

export function okJson<T extends Record<string, unknown>>(data: T): NextResponse {
  return json({ ok: true, ...data });
}
