import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { getAdminSession, isAdminRequest, type AdminSession } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorJson } from "@/lib/http";
import { can, isRole, permissionsFor, type Permission, type Role } from "@/lib/admin/roles";

/**
 * Quién hace el pedido y con qué rol. El rol se lee de la base en cada pedido (no va en la
 * cookie), así un cambio de rol o una baja rige al instante y no recién cuando vence la sesión.
 *
 * - Usuario del panel: su fila de admin_users (tiene que estar activa).
 * - Acceso de emergencia (ADMIN_USERNAME / ADMIN_PASSWORD) y la API key (x-admin-key): admin.
 */
export type Actor = AdminSession & { role: Role; permissions: Permission[] };

type RoleRow = { role?: string | null; active: boolean };

/** Rol y estado de un usuario. Sin la migración 012 (no existe la columna) todos son admin. */
export async function loadRole(userId: string): Promise<{ role: Role; active: boolean } | null> {
  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase.from("admin_users").select("role,active").eq("id", userId).maybeSingle();
  if (error && error.code === "42703") {
    ({ data, error } = await supabase.from("admin_users").select("active").eq("id", userId).maybeSingle());
  }
  if (error) throw error;
  const row = data as RoleRow | null;
  if (!row) return null;
  return { role: isRole(row.role) ? row.role : "admin", active: row.active };
}

function asActor(session: AdminSession, role: Role): Actor {
  return { ...session, role, permissions: permissionsFor(role) };
}

export async function getActor(request: NextRequest): Promise<Actor | null> {
  const session = getAdminSession(request);
  if (session) {
    if (session.userId === null) return asActor(session, "admin");
    const found = await loadRole(session.userId).catch((error) => {
      console.error("[access] no se pudo leer el rol", error);
      return null;
    });
    if (!found || !found.active) return null;
    return asActor(session, found.role);
  }
  // Sin cookie: la API key de administración.
  if (isAdminRequest(request)) return asActor({ userId: null, name: "API", email: null }, "admin");
  return null;
}

/**
 * Para las rutas: devuelve el actor o la respuesta de error lista para devolver.
 *   const actor = await requireActor(request, "finance");
 *   if (actor instanceof Response) return actor;
 */
export async function requireActor(request: NextRequest, permission?: Permission): Promise<Actor | NextResponse> {
  const actor = await getActor(request);
  if (!actor) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  if (permission && !can(actor.role, permission)) {
    return errorJson("Tu rol no tiene acceso a esto. Pedíselo a un administrador.", 403, "FORBIDDEN");
  }
  return actor;
}
