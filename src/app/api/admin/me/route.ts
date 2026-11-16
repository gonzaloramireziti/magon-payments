import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireActor(request);
  if (session instanceof Response) return session;
  return okJson({ me: { id: session.userId, name: session.name, email: session.email, emergency: session.userId === null, role: session.role, permissions: session.permissions } });
}
