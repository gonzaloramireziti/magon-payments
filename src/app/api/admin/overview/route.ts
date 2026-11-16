import type { NextRequest } from "next/server";
import { getAdminOverview } from "@/lib/admin/overview";
import { requireActor } from "@/lib/admin/access";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireActor(request, "finance");
  if (guard instanceof Response) return guard;
  try {
    return okJson({ overview: await getAdminOverview() });
  } catch (error) {
    console.error("[api/admin/overview]", error);
    return errorJson("No se pudo calcular el resumen", 500, "OVERVIEW_ERROR");
  }
}
