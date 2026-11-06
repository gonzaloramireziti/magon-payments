import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { availableChannels, getPrefs, NotifyError, savePrefs, sendTest } from "@/lib/notify/service";
import { CHANNELS, type Channel } from "@/lib/notify/prefs";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof NotifyError) return errorJson(error.message, error.statusCode, error.code);
  console.error("[api/admin/me/notifications]", error);
  return errorJson("No se pudieron procesar los avisos", 500, "NOTIFY_ERROR");
}

function currentUser(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return { error: errorJson("No autorizado", 401, "UNAUTHORIZED") };
  if (!session.userId) {
    return { error: errorJson("Entrá con tu usuario para configurar tus avisos", 400, "EMERGENCY_SESSION") };
  }
  return { userId: session.userId };
}

export async function GET(request: NextRequest) {
  const user = currentUser(request);
  if ("error" in user) return user.error;
  try {
    return okJson({ prefs: await getPrefs(user.userId), available: availableChannels() });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  const user = currentUser(request);
  if ("error" in user) return user.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return okJson({ prefs: await savePrefs(user.userId, { channels: body.channels, events: body.events }) });
  } catch (error) {
    return handleError(error);
  }
}

// Envío de prueba por un canal, con lo que el usuario tiene cargado (aunque no lo haya guardado).
export async function POST(request: NextRequest) {
  const user = currentUser(request);
  if ("error" in user) return user.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const channel = body.channel as Channel;
    if (!CHANNELS.includes(channel)) return errorJson("Canal inválido", 400, "INVALID_CHANNEL");
    await sendTest(user.userId, channel, body.channels);
    return okJson({ sent: true });
  } catch (error) {
    return handleError(error);
  }
}
