import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { isMissingTable } from "@/lib/tickets/service";
import {
  addEntry,
  deleteEntry,
  listEntries,
  runningEntry,
  startTimer,
  stopTimer,
  ticketTotal,
  TimeError,
  updateEntry,
} from "@/lib/time/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof TimeError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson("Falta correr la migración 012", 503, "TIME_UNAVAILABLE");
  console.error("[api/admin/time]", error);
  return errorJson("No se pudieron procesar las horas", 500, "TIME_ERROR");
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// GET ?from=&to=&userId=&clientId=&ticketId=  → horas + cronómetro en curso
// GET ?ticketTotal=<id>                        → total del ticket por persona
export async function GET(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  const params = request.nextUrl.searchParams;
  try {
    const total = params.get("ticketTotal");
    if (total) return okJson({ total: await ticketTotal(total) });
    const [entries, running] = await Promise.all([
      listEntries(actor, {
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        userId: params.get("userId") ?? undefined,
        clientId: params.get("clientId") ?? undefined,
        ticketId: params.get("ticketId") ?? undefined,
      }),
      runningEntry(actor),
    ]);
    return okJson({ entries, running });
  } catch (error) {
    return handleError(error);
  }
}

// POST { action: "start" | "stop" } para el cronómetro, o { minutes, date?, ticketId?, clientId?, note? }.
export async function POST(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  try {
    const body = await readBody(request);
    if (body.action === "start") return okJson(await startTimer(actor, body));
    if (body.action === "stop") return okJson({ entry: await stopTimer(actor) });
    return okJson({ entry: await addEntry(actor, body) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  try {
    const body = await readBody(request);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
    return okJson({ entry: await updateEntry(actor, id, body) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    await deleteEntry(actor, id);
    return okJson({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
