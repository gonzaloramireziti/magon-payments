import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/admin/auth";
import { loadRole } from "@/lib/admin/access";
import { permissionsFor, type Role } from "@/lib/admin/roles";
import { AdminLogin } from "./AdminLogin";
import { AdminApp } from "./AdminApp";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const store = await cookies();
  const session = readSessionToken(store.get(ADMIN_COOKIE)?.value);
  if (!session) return <AdminLogin />;
  // Un usuario desactivado pierde el acceso aunque su sesión no haya vencido. El rol se lee de la
  // base: si un admin lo cambia, rige en la próxima carga.
  let role: Role = "admin";
  if (session.userId !== null) {
    const found = await loadRole(session.userId).catch(() => null);
    if (!found || !found.active) return <AdminLogin />;
    role = found.role;
  }
  return (
    <AdminApp
      me={{
        id: session.userId,
        name: session.name,
        email: session.email,
        emergency: session.userId === null,
        role,
        permissions: permissionsFor(role),
      }}
    />
  );
}
