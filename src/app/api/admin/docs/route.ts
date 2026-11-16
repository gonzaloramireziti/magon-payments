import type { NextRequest } from "next/server";
import { deleteDoc, DocError, listDocs, saveDoc } from "@/lib/docs/service";
import { isMissingTable } from "@/lib/tickets/service";
import { requireActor } from "@/lib/admin/access";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof DocError) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson("Falta correr la migración 006", 503, "DOCS_UNAVAILABLE");
  console.error("[api/admin/docs]", error);
  return errorJson("No se pudo procesar la documentación", 500, "DOCS_ERROR");
}

export async function GET(request: NextRequest) {
  const guard = await requireActor(request);
  if (guard instanceof Response) return guard;
  try {
    return okJson({ docs: await listDocs() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await requireActor(request);
  if (session instanceof Response) return session;
  try {
    return okJson({ id: await saveDoc(session, (await request.json()) as Record<string, unknown>) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireActor(request);
  if (guard instanceof Response) return guard;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    await deleteDoc(id);
    return okJson({ deleted: id });
  } catch (error) {
    return handleError(error);
  }
}
