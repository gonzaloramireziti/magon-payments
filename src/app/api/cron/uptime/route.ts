import type { NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { runUptimeChecks } from "@/lib/infra/service";
import { runReminderAlerts } from "@/lib/agenda/service";
import { isMissingTable } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron frecuente: monitoreo de caídas y recordatorios de la agenda. Lo llama el workflow
// «Monitoreo» de GitHub cada 10 minutos (y Vercel una vez por día, de respaldo).
async function run(request: NextRequest) {
  if (!isCronRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const [uptime, reminders] = await Promise.all([
    runUptimeChecks().catch((error) => failure("uptime", error, "014")),
    runReminderAlerts().catch((error) => failure("reminders", error, "015")),
  ]);
  return okJson({ uptime, reminders });
}

function failure(task: string, error: unknown, migration: string) {
  if (isMissingTable(error)) return { skipped: `Falta la migración ${migration}` };
  console.error(`[cron/uptime] ${task}`, error);
  return { error: (error as Error).message };
}

export const GET = run;
export const POST = run;
