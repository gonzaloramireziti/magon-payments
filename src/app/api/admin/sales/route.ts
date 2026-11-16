import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { convertLead, deleteLead, listLeads, saveLead } from "@/lib/sales/service";
import { readJson, routeError } from "@/lib/route";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor(request, "manage");
  if (actor instanceof Response) return actor;
  try {
    return okJson({ leads: await listLeads() });
  } catch (error) {
    return routeError("sales", "015", error);
  }
}

// POST { ...prospecto } crea o edita; { convert: id, startPeriod? } lo pasa a cliente.
export async function POST(request: NextRequest) {
  const actor = await requireActor(request, "manage");
  if (actor instanceof Response) return actor;
  try {
    const body = await readJson(request);
    if (typeof body.convert === "string") {
      const result = await convertLead(body.convert, body);
      return okJson({ ...result, leads: await listLeads() });
    }
    const lead = await saveLead(body);
    return okJson({ lead });
  } catch (error) {
    return routeError("sales", "015", error);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await requireActor(request, "manage");
  if (actor instanceof Response) return actor;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    await deleteLead(id);
    return okJson({ deleted: true });
  } catch (error) {
    return routeError("sales", "015", error);
  }
}
