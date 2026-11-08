import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { defaultPeriod, isPeriod, NoticeError } from "@/lib/billing/notices";
import { allInvoices, clientInvoice } from "@/lib/billing/invoices";
import { errorJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET ?clientId=…&period=YYYY-MM → factura de un cliente. GET ?all=1&period=… → todas en un PDF.
// Sin period usa el último período facturado (el mes anterior). ?inline=1 la abre en el navegador.
export async function GET(request: NextRequest) {
  if (!getAdminSession(request)) return errorJson("No autorizado", 401, "UNAUTHORIZED");
  const params = request.nextUrl.searchParams;
  const period = isPeriod(params.get("period")) ? (params.get("period") as string) : defaultPeriod();
  try {
    const { bytes, filename } =
      params.get("all") === "1" ? await allInvoices(period) : await clientInvoice(params.get("clientId") ?? "", period);
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
    console.error("[api/admin/billing/invoice]", error);
    return errorJson("No se pudo generar la factura", 500, "INVOICE_ERROR");
  }
}
