import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { IntegrationError } from "@/lib/integrations/service";
import { TriageError } from "@/lib/triage/analyze";
import { runTriage, saveDecisions } from "@/lib/triage/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function handleError(error: unknown) {
  if (error instanceof TriageError || error instanceof IntegrationError) {
    return errorJson(error.message, error.statusCode, error.code);
  }
  console.error("[api/admin/tickets/triage]", error);
  return errorJson("No se pudo analizar el ticket", 500, "TRIAGE_ERROR");
}

async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Analiza el ticket con Claude (API key del responsable).
export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const body = await readJson(request);
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId : "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson(await runTriage(ticketId, session));
  } catch (error) {
    return handleError(error);
  }
}

// Guarda las respuestas del equipo a las preguntas del análisis.
export async function PUT(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const body = await readJson(request);
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId : "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson(await saveDecisions(ticketId, body?.answers, session));
  } catch (error) {
    return handleError(error);
  }
}
