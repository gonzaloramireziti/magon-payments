import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE, createSessionToken, isSecureRequest } from "@/lib/admin/auth";
import { acceptInvite, describeInvite, UserError } from "@/lib/admin/users";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof UserError) return errorJson(error.message, error.statusCode, error.code);
  console.error("[api/admin/invite]", error);
  return errorJson("No se pudo procesar la invitación", 500, "INVITE_ERROR");
}

// Pública: la protege el token del link, que se guarda hasheado y vence a los 7 días.
export async function GET(request: NextRequest) {
  try {
    return okJson({ invite: await describeInvite(request.nextUrl.searchParams.get("token") ?? "") });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const user = await acceptInvite(
      typeof body.token === "string" ? body.token : "",
      typeof body.password === "string" ? body.password : ""
    );
    const response = okJson({ authenticated: true });
    response.cookies.set({
      name: ADMIN_COOKIE,
      value: createSessionToken(user),
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(request),
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return handleError(error);
  }
}
