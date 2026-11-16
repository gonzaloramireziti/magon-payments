import type { NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { runUptimeChecks } from "@/lib/infra/service";
import { isMissingTable } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Monitoreo de caídas. Lo llama el workflow de GitHub cada 10 minutos (y Vercel una vez por día).
async function run(request: NextRequest) {
  if (!isCronRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    return okJson(await runUptimeChecks());
  } catch (error) {
    if (isMissingTable(error)) return okJson({ skipped: "Falta la migración 014" });
    console.error("[cron/uptime]", error);
    return errorJson("Falló el monitoreo", 500, "CRON_ERROR");
  }
}

export const GET = run;
export const POST = run;
