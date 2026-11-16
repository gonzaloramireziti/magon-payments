import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashInviteToken,
  hashPassword,
  INVITE_TTL_MS,
  newInviteToken,
  passwordProblem,
  verifyPassword,
} from "@/lib/admin/passwords";
import { isRole, type Role } from "@/lib/admin/roles";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  pending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  // Migración 012; sin ella falta y se toma como admin.
  role?: string | null;
  active: boolean;
  invite_token_hash: string | null;
  invite_expires_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

export class UserError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: isRole(row.role) ? row.role : "admin",
    active: row.active,
    pending: !row.password_hash,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AdminUserRow[]).map(toUser);
}

// Devuelve el usuario si email y contraseña coinciden y la cuenta está activa.
export async function authenticate(emailRaw: unknown, password: string): Promise<AdminUser | null> {
  const email = normalizeEmail(emailRaw);
  if (!email || !password) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("admin_users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  const row = data as AdminUserRow | null;
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) return null;
  await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", row.id);
  return toUser(row);
}

export async function isActiveUser(id: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("admin_users")
    .select("active")
    .eq("id", id)
    .maybeSingle();
  return Boolean(data?.active);
}

async function issueInvite(id: string): Promise<{ token: string; expiresAt: string }> {
  const { token, hash } = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ invite_token_hash: hash, invite_expires_at: expiresAt })
    .eq("id", id);
  if (error) throw error;
  return { token, expiresAt };
}

export async function createUser(nameRaw: unknown, emailRaw: unknown, roleRaw: unknown = undefined) {
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const email = normalizeEmail(emailRaw);
  if (!name) throw new UserError("MISSING_NAME", 400, "Falta el nombre");
  if (!email.includes("@")) throw new UserError("INVALID_EMAIL", 400, "El email no es válido");
  if (roleRaw !== undefined && !isRole(roleRaw)) throw new UserError("INVALID_ROLE", 400, "Rol inválido");

  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .insert(roleRaw === undefined ? { name, email } : { name, email, role: roleRaw })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new UserError("DUPLICATE_EMAIL", 409, "Ya existe un usuario con ese email");
    if (error.code === "PGRST204") throw new UserError("ROLES_UNAVAILABLE", 503, "Falta correr la migración 012");
    throw error;
  }
  const invite = await issueInvite(data.id as string);
  return { user: toUser(data as AdminUserRow), invite };
}

// Genera un link nuevo: sirve para reenviar la invitación o para blanquear la contraseña.
export async function resetInvite(id: string) {
  return issueInvite(id);
}

export async function setUserActive(id: string, active: boolean, actingUserId: string | null) {
  if (!active && id === actingUserId) {
    throw new UserError("SELF_DEACTIVATE", 400, "No podés desactivar tu propio usuario");
  }
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({ active })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toUser(data as AdminUserRow);
}

// Cambia el rol. Siempre tiene que quedar al menos un administrador activo, y nadie se baja
// el rol a sí mismo (lo tiene que hacer otro admin).
export async function setUserRole(id: string, roleRaw: unknown, actingUserId: string | null) {
  if (!isRole(roleRaw)) throw new UserError("INVALID_ROLE", 400, "Rol inválido");
  if (id === actingUserId && roleRaw !== "admin") {
    throw new UserError("SELF_DEMOTE", 400, "No podés sacarte el rol de administrador: pedíselo a otro admin");
  }
  const supabase = getSupabaseAdmin();
  if (roleRaw !== "admin") {
    const { data: admins, error: adminsError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("role", "admin")
      .eq("active", true);
    if (adminsError) {
      if (adminsError.code === "42703") throw new UserError("ROLES_UNAVAILABLE", 503, "Falta correr la migración 012");
      throw adminsError;
    }
    if (!(admins ?? []).some((a) => a.id !== id)) {
      throw new UserError("LAST_ADMIN", 400, "Tiene que quedar al menos un administrador activo");
    }
  }
  const { data, error } = await supabase.from("admin_users").update({ role: roleRaw }).eq("id", id).select("*").single();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new UserError("ROLES_UNAVAILABLE", 503, "Falta correr la migración 012");
    }
    throw error;
  }
  return toUser(data as AdminUserRow);
}

async function findByInvite(token: string): Promise<AdminUserRow> {
  if (!token) throw new UserError("INVALID_INVITE", 400, "El link de invitación no es válido");
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("*")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw error;
  const row = data as AdminUserRow | null;
  if (!row || !row.active) {
    throw new UserError("INVALID_INVITE", 400, "El link de invitación no es válido o ya se usó");
  }
  if (!row.invite_expires_at || new Date(row.invite_expires_at).getTime() < Date.now()) {
    throw new UserError("EXPIRED_INVITE", 400, "El link de invitación venció. Pedí uno nuevo.");
  }
  return row;
}

export async function describeInvite(token: string) {
  const row = await findByInvite(token);
  return { name: row.name, email: row.email };
}

export async function acceptInvite(token: string, password: string): Promise<AdminUser> {
  const row = await findByInvite(token);
  const problem = passwordProblem(password);
  if (problem) throw new UserError("WEAK_PASSWORD", 400, problem);
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .update({
      password_hash: hashPassword(password),
      invite_token_hash: null,
      invite_expires_at: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw error;
  return toUser(data as AdminUserRow);
}

// Para acciones sensibles (desbloquear la bóveda): vuelve a pedir la contraseña.
export async function verifyUserPassword(id: string, password: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_users")
    .select("password_hash,active")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.active) && verifyPassword(password, (data?.password_hash as string | null) ?? null);
}
