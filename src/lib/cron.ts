import type { NextRequest } from "next/server";
import { cronSecret } from "@/lib/env";

/** Crons: Vercel manda `Authorization: Bearer $CRON_SECRET`; también se acepta x-cron-secret. */
export function isCronRequest(request: NextRequest): boolean {
  if (!cronSecret) return false;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    null;
  return provided === cronSecret;
}
