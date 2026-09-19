import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, isSecureRequest } from "@/lib/admin/auth";
import { okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = okJson({ authenticated: false });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
