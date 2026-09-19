import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin/auth";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function parseCost(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const amount = Number(body.amount);
  const currency = typeof body.currency === "string" ? body.currency : "ARS";
  const active = body.active === undefined ? true : Boolean(body.active);
  const notes = typeof body.notes === "string" ? body.notes : null;
  return { name, amount, currency, active, notes };
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("costs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return errorJson(error.message, 500, "DB_ERROR");
  return okJson({ costs: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const cost = parseCost(body);
  if (!cost.name) return errorJson("El nombre es obligatorio", 400, "MISSING_NAME");
  if (!Number.isFinite(cost.amount) || cost.amount < 0) {
    return errorJson("Monto inválido", 400, "INVALID_AMOUNT");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("costs").insert(cost).select("*").single();
  if (error) return errorJson(error.message, 500, "DB_ERROR");
  return okJson({ cost: data });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (body.amount !== undefined) update.amount = Number(body.amount);
  if (typeof body.currency === "string") update.currency = body.currency;
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (typeof body.notes === "string" || body.notes === null) update.notes = body.notes;

  if (Object.keys(update).length === 0) {
    return errorJson("Nada para actualizar", 400, "EMPTY_UPDATE");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("costs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return errorJson(error.message, 500, "DB_ERROR");
  return okJson({ cost: data });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const id =
    (typeof body.id === "string" ? body.id : null) ??
    new URL(request.url).searchParams.get("id");
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("costs").delete().eq("id", id);
  if (error) return errorJson(error.message, 500, "DB_ERROR");
  return okJson({ deleted: id });
}
