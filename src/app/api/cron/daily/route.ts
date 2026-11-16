import type { NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { runExpiryAlerts } from "@/lib/infra/service";
import { isMissingTable } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// Tareas de una vez por día: avisos de vencimientos (dominios, hosting, SSL...).
async function run(request: NextRequest) {
  if (!isCronRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    return okJson({ expiring: await runExpiryAlerts() });
  } catch (error) {
    if (isMissingTable(error)) return okJson({ skipped: "Falta la migración 014" });
    console.error("[cron/daily]", error);
    return errorJson("Falló el cron diario", 500, "CRON_ERROR");
  }
}

export const GET = run;
export const POST = run;
