import type { NextRequest } from "next/server";
import { errorJson } from "@/lib/http";
import { isMissingTable } from "@/lib/tickets/service";

/** Errores de dominio con código y status (ProjectError, SalesError...). */
type DomainError = Error & { code: string; statusCode: number };

function isDomainError(error: unknown): error is DomainError {
  return error instanceof Error && typeof (error as DomainError).statusCode === "number" && typeof (error as DomainError).code === "string";
}

/** Respuesta de error común para las rutas del panel. */
export function routeError(scope: string, migration: string, error: unknown) {
  if (isDomainError(error)) return errorJson(error.message, error.statusCode, error.code);
  if (isMissingTable(error)) return errorJson(`Falta correr la migración ${migration}`, 503, "MIGRATION_MISSING");
  console.error(`[api/admin/${scope}]`, error);
  return errorJson("No se pudo procesar el pedido", 500, "SERVER_ERROR");
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
