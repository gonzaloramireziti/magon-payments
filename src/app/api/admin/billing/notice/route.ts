import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { allNotices, clientNotice, defaultPeriod, isPeriod, NoticeError } from "@/lib/billing/notices";
import { errorJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET ?clientId=…&period=YYYY-MM → aviso de un cliente. GET ?all=1&period=… → todos en un PDF.
export async function GET(request: NextRequest) {
  if (!getAdminSession(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const params = request.nextUrl.searchParams;
  const period = isPeriod(params.get("period")) ? (params.get("period") as string) : defaultPeriod();
  try {
    const { bytes, filename } =
      params.get("all") === "1" ? await allNotices(period) : await clientNotice(params.get("clientId") ?? "", period);
    const disposition = params.get("inline") === "1" ? "inline" : "attachment";
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NoticeError) return errorJson(error.message, error.statusCode, error.code);
    console.error("[api/admin/billing/notice]", error);
    return errorJson("No se pudo generar el aviso", 500, "NOTICE_ERROR");
  }
}
