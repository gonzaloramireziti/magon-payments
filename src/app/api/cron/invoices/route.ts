import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronSecret } from "@/lib/env";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  if (!cronSecret) return false;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    null;
  return provided === cronSecret;
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  const supabase = getSupabaseAdmin();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("client_key")
    .eq("active", true);
  if (error) return errorJson(error.message, 500, "DB_ERROR");

  let generated = 0;
  let failed = 0;
  for (const client of clients ?? []) {
    try {
      await getSubscriptionStatus(client.client_key);
      generated += 1;
    } catch (err) {
      failed += 1;
      console.error("[cron/invoices]", client.client_key, err);
    }
  }

  return okJson({ processed: clients?.length ?? 0, generated, failed });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
