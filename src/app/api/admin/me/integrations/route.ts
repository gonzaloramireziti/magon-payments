import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getIntegrationStatus,
  IntegrationError,
  removeIntegration,
  saveAnthropicKey,
  saveGithubToken,
} from "@/lib/integrations/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof IntegrationError) return errorJson(error.message, error.statusCode, error.code);
  console.error("[api/admin/me/integrations]", error);
  return errorJson("No se pudieron procesar tus integraciones", 500, "INTEGRATIONS_ERROR");
}

function userSession(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return { error: errorJson("No autorizado", 401, "UNAUTHORIZED") };
  if (!session.userId) {
    return { error: errorJson("El acceso de emergencia no tiene integraciones: entrá con tu usuario.", 403, "NEEDS_USER") };
  }
  return { userId: session.userId };
}

export async function GET(request: NextRequest) {
  const { userId, error } = userSession(request);
  if (!userId) return error;
  try {
    return okJson({ integrations: await getIntegrationStatus(userId) });
  } catch (err) {
    return handleError(err);
  }
}

// Body: { kind: "github" | "anthropic", secret: string }. El secreto no vuelve nunca.
export async function PUT(request: NextRequest) {
  const { userId, error } = userSession(request);
  if (!userId) return error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.kind === "github") await saveGithubToken(userId, body.secret);
    else if (body.kind === "anthropic") await saveAnthropicKey(userId, body.secret);
    else return errorJson("Integración desconocida", 400, "BAD_KIND");
    return okJson({ integrations: await getIntegrationStatus(userId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, error } = userSession(request);
  if (!userId) return error;
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "github" && kind !== "anthropic") return errorJson("Integración desconocida", 400, "BAD_KIND");
  try {
    await removeIntegration(userId, kind);
    return okJson({ integrations: await getIntegrationStatus(userId) });
  } catch (err) {
    return handleError(err);
  }
}
