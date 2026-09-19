import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/auth";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const store = await cookies();
  const authenticated = verifySessionToken(store.get(ADMIN_COOKIE)?.value);
  return authenticated ? <AdminDashboard /> : <AdminLogin />;
}
