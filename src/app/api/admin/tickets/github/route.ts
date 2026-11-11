import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { IntegrationError } from "@/lib/integrations/service";
import { GithubError } from "@/lib/github/api";
import { createPull, sendToGithub, syncGithub } from "@/lib/github/service";
import { TicketError } from "@/lib/tickets/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof GithubError || error instanceof IntegrationError || error instanceof TicketError) {
    return errorJson(error.message, error.statusCode, error.code);
  }
  console.error("[api/admin/tickets/github]", error);
  return errorJson("No se pudo hablar con GitHub", 500, "GITHUB_ERROR");
}

async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Estado del issue: comentarios, ramas y PRs. Pasa al ticket las preguntas nuevas de Claude.
export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const ticketId = request.nextUrl.searchParams.get("ticketId") ?? "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson({ github: await syncGithub(ticketId, session) });
  } catch (error) {
    return handleError(error);
  }
}

// Manda el ticket como issue al repo del cliente. Body: { ticketId, prompt, repo? }
export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const body = await readJson(request);
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson({ issue: await sendToGithub(ticketId, body.prompt, body.repo, session) });
  } catch (error) {
    return handleError(error);
  }
}

// Crea el PR desde la rama de Claude. Body: { ticketId, branch }
export async function PUT(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const body = await readJson(request);
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
  if (!ticketId) return errorJson("Falta el ticket", 400, "MISSING_TICKET");
  try {
    return okJson({ pull: await createPull(ticketId, body.branch, session) });
  } catch (error) {
    return handleError(error);
  }
}
