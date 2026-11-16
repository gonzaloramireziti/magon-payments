import type { NextRequest } from "next/server";
import { requireActor } from "@/lib/admin/access";
import { can } from "@/lib/admin/roles";
import { deleteProject, linkTicket, listProjects, ProjectError, saveMilestone, saveProject } from "@/lib/projects/service";
import { readJson, routeError } from "@/lib/route";
import { errorJson, okJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  try {
    return okJson({ projects: await listProjects(actor) });
  } catch (error) {
    return routeError("projects", "015", error);
  }
}

// POST { ...proyecto } crea o edita (admins). { milestone: {...} } etapas. { link: { ticketId, projectId } } asocia un ticket.
export async function POST(request: NextRequest) {
  const actor = await requireActor(request);
  if (actor instanceof Response) return actor;
  const manage = can(actor.role, "manage");
  try {
    const body = await readJson(request);
    if (body.milestone && typeof body.milestone === "object") {
      await saveMilestone(body.milestone as Record<string, unknown>, manage);
    } else if (body.link && typeof body.link === "object") {
      const link = body.link as Record<string, unknown>;
      if (typeof link.ticketId !== "string") throw new ProjectError("MISSING_TICKET", 400, "Falta el ticket");
      await linkTicket(link.ticketId, typeof link.projectId === "string" && link.projectId ? link.projectId : null);
    } else {
      if (!manage) return errorJson("Solo un administrador crea o edita proyectos", 403, "FORBIDDEN");
      // Sin acceso a la plata no se toca el presupuesto.
      if (!can(actor.role, "finance")) delete body.budget;
      await saveProject(body);
    }
    return okJson({ projects: await listProjects(actor) });
  } catch (error) {
    return routeError("projects", "015", error);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await requireActor(request, "manage");
  if (actor instanceof Response) return actor;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return errorJson("Falta el id", 400, "MISSING_ID");
  try {
    await deleteProject(id);
    return okJson({ deleted: true });
  } catch (error) {
    return routeError("projects", "015", error);
  }
}
