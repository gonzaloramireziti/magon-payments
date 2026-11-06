import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/admin/auth";
import { isActiveUser } from "@/lib/admin/users";
import { AdminLogin } from "./AdminLogin";
import { AdminApp } from "./AdminApp";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const store = await cookies();
  const session = readSessionToken(store.get(ADMIN_COOKIE)?.value);
  // Un usuario desactivado pierde el acceso aunque su sesión no haya vencido.
  const active = session && (session.userId === null || (await isActiveUser(session.userId).catch(() => false)));
  if (!session || !active) return <AdminLogin />;
  return (
    <AdminApp
      me={{ id: session.userId, name: session.name, email: session.email, emergency: session.userId === null }}
    />
  );
}
