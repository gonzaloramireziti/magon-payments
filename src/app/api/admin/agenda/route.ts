import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { deleteReminder, listReminders, saveReminder } from "@/lib/agenda/service";
import { readJson, routeError } from "@/lib/route";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  try {
    return okJson({ reminders: await listReminders(actor) });
  } catch (error) {
    return routeError("agenda", "015", error);
  }
}

// POST { title, dueAt, kind?, clientId?, leadId?, ticketId?, notes? } crea; con id edita ({ id, done: true } lo marca hecho).
export async function POST(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  try {
    return okJson({ reminder: await saveReminder(actor, await readJson(request)) });
  } catch (error) {
    return routeError("agenda", "015", error);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    await deleteReminder(actor, id);
    return okJson({ deleted: true });
  } catch (error) {
    return routeError("agenda", "015", error);
  }
}
