import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  return okJson({ me: { id: session.userId, name: session.name, email: session.email, emergency: session.userId === null } });
}
