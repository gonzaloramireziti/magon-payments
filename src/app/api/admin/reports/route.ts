import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { buildClientReport, sendClientReport } from "@/lib/reports/clientReport";
import { readJson, routeError } from "@/lib/route";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET ?clientId=&period=YYYY-MM → reporte mensual del cliente (por defecto, el mes pasado).
export async function GET(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  const params = request.nextUrl.searchParams;
  const clientId = params.get("clientId") ?? "";
  if (!clientId) return errorJson("Falta el cliente", 400, "MISSING_CLIENT");
  try {
    return okJson({ report: await buildClientReport(clientId, params.get("period")) });
  } catch (error) {
    return routeError("reports", "003", error);
  }
}

// POST { clientId, period, to?, text? } lo manda por correo. `text` permite mandarlo editado.
export async function POST(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  try {
    const body = await readJson(request);
    if (typeof body.clientId !== "string") return errorJson("Falta el cliente", 400, "MISSING_CLIENT");
    const report = await buildClientReport(body.clientId, body.period);
    if (typeof body.text === "string" && body.text.trim()) report.text = body.text.slice(0, 20_000);
    return okJson({ sentTo: await sendClientReport(report, body.to) });
  } catch (error) {
    return routeError("reports", "003", error);
  }
}
