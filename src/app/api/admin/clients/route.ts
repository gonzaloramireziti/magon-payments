import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin/auth";
import { getSubscriptionStatus } from "@/lib/subscription/service";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  return isAdminRequest(request);
}

function generateClientKey(): string {
  return `magon_${randomBytes(12).toString("hex")}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  const withStatus = new URL(request.url).searchParams.get("withStatus") === "1";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return errorJson(error.message, 500, "DB_ERROR");

  if (!withStatus) return okJson({ clients: data ?? [] });

  const clients = await Promise.all(
    (data ?? []).map(async (client) => {
      try {
        const status = await getSubscriptionStatus(client.client_key);
        return { ...client, status };
      } catch {
        return { ...client, status: null };
      }
    })
  );
  return okJson({ clients });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("JSON inválido", 400, "BAD_JSON");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const monthlyAmount = Number(body.monthlyAmount ?? body.amount ?? 0);
  if (!name) return errorJson("El nombre es obligatorio", 400, "MISSING_NAME");
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
    return errorJson("El monto mensual es inválido", 400, "INVALID_AMOUNT");
  }

  const clientKey =
    typeof body.clientKey === "string" && body.clientKey.trim() !== ""
      ? body.clientKey.trim()
      : generateClientKey();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      client_key: clientKey,
      name,
      email: typeof body.email === "string" ? body.email : null,
      monthly_amount: monthlyAmount,
      currency: typeof body.currency === "string" ? body.currency : "ARS",
      active: body.active === undefined ? true : Boolean(body.active),
      notes: typeof body.notes === "string" ? body.notes : null,
      start_period: typeof body.startPeriod === "string" ? body.startPeriod : null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return errorJson("Esa KEY ya existe", 409, "DUPLICATE_KEY");
    return errorJson(error.message, 500, "DB_ERROR");
  }

  return okJson({ client: data });
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("JSON inválido", 400, "BAD_JSON");
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return errorJson("Falta el id del cliente", 400, "MISSING_ID");

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.email === "string" || body.email === null) update.email = body.email;
  if (body.monthlyAmount !== undefined) update.monthly_amount = Number(body.monthlyAmount);
  if (typeof body.currency === "string") update.currency = body.currency;
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (typeof body.notes === "string" || body.notes === null) update.notes = body.notes;
  if (typeof body.startPeriod === "string" || body.startPeriod === null) {
    update.start_period = body.startPeriod;
  }
  if (typeof body.clientKey === "string" && body.clientKey.trim() !== "") {
    update.client_key = body.clientKey.trim();
  }
  if (body.rotateKey === true) update.client_key = generateClientKey();

  if (Object.keys(update).length === 0) {
    return errorJson("Nada para actualizar", 400, "EMPTY_UPDATE");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return errorJson("Esa KEY ya existe", 409, "DUPLICATE_KEY");
    return errorJson(error.message, 500, "DB_ERROR");
  }

  return okJson({ client: data });
}
