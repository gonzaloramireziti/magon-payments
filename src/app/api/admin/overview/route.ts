import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/overview";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  try {
    return okJson({ overview: await getAdminOverview() });
  } catch (error) {
    console.error("[api/admin/overview]", error);
    return errorJson("No se pudo calcular el resumen", 500, "OVERVIEW_ERROR");
  }
}
