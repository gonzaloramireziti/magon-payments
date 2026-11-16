import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { isMissingTable } from "@/lib/tickets/service";
import {
  deleteAsset,
  deleteCheck,
  InfraError,
  listAssets,
  listChecks,
  runUptimeChecks,
  saveAsset,
  saveCheck,
} from "@/lib/infra/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function handleError(error: unknown) {
  if (error instanceof InfraError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson("Falta correr la migración 014", 503, "INFRA_UNAVAILABLE");
  console.error("[api/admin/infra]", error);
  return errorJson("No se pudo procesar la infraestructura", 500, "INFRA_ERROR");
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  try {
    const [assets, checks] = await Promise.all([listAssets(), listChecks()]);
    return okJson({ assets, checks });
  } catch (error) {
    return handleError(error);
  }
}

// POST { type: "asset" | "check", ...campos } crea o (con id) edita. { action: "check-now" } revisa ya.
export async function POST(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  try {
    const body = await readBody(request);
    if (body.action === "check-now") return okJson({ result: await runUptimeChecks(), checks: await listChecks() });
    if (body.type === "check") return okJson({ check: await saveCheck(body) });
    return okJson({ asset: await saveAsset(body) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireActor(request, "manage");
  if (guard instanceof Response) return guard;
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    if (params.get("type") === "check") await deleteCheck(id);
    else await deleteAsset(id);
    return okJson({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
